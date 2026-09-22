"""Admin MIDI import HTTP checks. Use ONLY a migrated disposable database and private test storage."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
import struct
import urllib.error
import urllib.parse
import urllib.request
import uuid


def midi(note=60):
    events = bytes([0, 0x90, note, 100, 0, 255, 47, 0])
    return b'MThd' + struct.pack('>IHHH', 6, 0, 1, 96) + b'MTrk' + struct.pack('>I', len(events)) + events


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--api', default='http://127.0.0.1:8080')
    parser.add_argument('--allow-writes', required=True, action='store_true')
    parser.add_argument('--expect-disabled', action='store_true')
    args = parser.parse_args()
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def request(path, method='GET', body=None, token=None, extra=None, expected=(200,)):
        headers = {'Content-Type': 'application/json'}
        if token:
            headers['Authorization'] = 'Bearer ' + token
        headers.update(extra or {})
        if body is not None and not isinstance(body, bytes):
            body = json.dumps(body).encode()
        req = urllib.request.Request(args.api.rstrip('/') + path, data=body, method=method, headers=headers)
        try:
            response = opener.open(req, timeout=60)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            raw = response.read()
            assert response.status in expected, f'{method} {path}: HTTP {response.status}, expected {expected}'
            assert 'no-store' in response.headers.get('Cache-Control', '')
            payload = json.loads(raw)
            for key in ('storage_key', 'access_key', 'secret_key', 'storage_url'):
                assert key not in raw.decode()
            return payload

    token = request('/api/v1/admin/login', 'POST', {
        'username': os.environ['ADMIN_TEST_USERNAME'], 'password': os.environ['ADMIN_TEST_PASSWORD']})['token']
    draft = {'title': 'Import smoke', 'slug': 'import-check-' + uuid.uuid4().hex, 'description': None,
             'estimated_year': None, 'archive_status': 'uncertain', 'copyright_status': 'unknown',
             'distribution_permission': 'restricted', 'license': None, 'rights_holder': None}
    first = request('/api/v1/admin/midis', 'POST', draft, token, expected=(201,))
    other = request('/api/v1/admin/midis', 'POST', {**draft, 'slug': draft['slug']+'-other'}, token, expected=(201,))
    path = '/api/v1/admin/midis/' + first['id'] + '/files'
    headers = {'Content-Type': 'application/octet-stream', 'X-File-Name': urllib.parse.quote('测试+乐曲.MID'),
               'X-Entry-Revision': '1', 'X-Rights-Confirmed': 'true'}
    request(path, expected=(401,))
    request(path, 'POST', midi(), extra=headers, expected=(401,))
    initial = request(path, token=token)
    if args.expect_disabled:
        assert not initial['enabled'] and initial['files'] == []
        assert request(path, 'POST', midi(), token, headers, (503,))['error']['code'] == 'IMPORT_DISABLED'
        assert request(path, token=token)['entry']['revision'] == 1
        print('PASS: disabled imports reject writes while metadata remains accessible')
        return
    assert initial['enabled'] and initial['max_file_size'] == 1048576 and initial['files'] == []
    for extra, body, status, code in [
        ({'X-Rights-Confirmed': 'false'}, midi(), 400, 'RIGHTS_CONFIRMATION_REQUIRED'),
        ({'X-File-Name': 'file.zip'}, midi(), 400, 'INVALID_FILE'),
        ({'X-File-Name': '%ZZ.mid'}, midi(), 400, 'INVALID_FILE'),
        ({'X-File-Name': 'path%2Ffile.mid'}, midi(), 400, 'INVALID_FILE'),
        ({'X-Entry-Revision': '0'}, midi(), 400, 'INVALID_INPUT'),
        ({'X-Entry-Revision': '9223372036854775808'}, midi(), 400, 'INVALID_INPUT'),
        ({'Content-Type': 'application/json'}, midi(), 415, 'INVALID_FILE'),
        ({}, b'not midi', 400, 'INVALID_MIDI'), ({}, b'', 400, 'INVALID_MIDI'),
        ({}, b'x' * 1048577, 413, 'FILE_TOO_LARGE')]:
        result = request(path, 'POST', body, token, {**headers, **extra}, (status,))
        assert result['error']['code'] == code
        assert request(path, token=token)['files'] == []
    saved = request(path, 'POST', midi(), token, headers)
    assert not saved['duplicate'] and saved['revision'] == 2
    assert saved['file']['sha256'] == hashlib.sha256(midi()).hexdigest()
    assert saved['file']['original_filename'] == '测试+乐曲.MID'
    with ThreadPoolExecutor(max_workers=2) as pool:
        retries = list(pool.map(lambda _: request(path, 'POST', midi(), token, headers), range(2)))
    assert all(item['duplicate'] and item['file']['id'] == saved['file']['id'] and item['revision'] == 2 for item in retries)
    assert request('/api/v1/admin/midis/'+other['id']+'/files', 'POST', midi(), token, headers, (409,))['error']['code'] == 'FILE_OWNERSHIP_CONFLICT'
    assert request(path, 'POST', midi(61), token, headers, (409,))['error']['code'] == 'STALE_ENTRY'
    current = request(path, token=token)
    assert len(current['files']) == 1 and current['entry']['revision'] == 2
    for field in ('archive_status', 'copyright_status', 'distribution_permission', 'license', 'rights_holder'):
        assert current['entry'][field] == first[field]
    public = request('/api/v1/midis/' + draft['slug'])
    assert public['files'][0]['sha256'] == saved['file']['sha256']
    request('/api/v1/files/' + saved['file']['id'], expected=(404,))
    print('PASS: import auth, encoded filenames, SMF/size limits, private confirmation, dedupe, ownership, revision and metadata-only responses')


if __name__ == '__main__':
    main()
