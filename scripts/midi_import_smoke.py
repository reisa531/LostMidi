"""Admin MIDI import HTTP checks. Use ONLY a migrated disposable database and private test storage."""
import argparse
import base64
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
    session = request('/api/v1/admin/session', token=token)
    assert session['midi_import_enabled'] is (not args.expect_disabled)
    draft = {'title': 'Import smoke', 'slug': 'import-check-' + uuid.uuid4().hex, 'description': None,
             'estimated_year': None, 'archive_status': 'uncertain', 'copyright_status': 'unknown',
             'distribution_permission': 'restricted', 'license': None, 'rights_holder': None}
    creation = {**draft, 'slug': 'create-check-' + uuid.uuid4().hex, 'request_id': str(uuid.uuid4())}
    metadata = request('/api/v1/admin/midis', 'POST', creation, token, expected=(201,))
    assert request('/api/v1/admin/midis', 'POST', creation, token, expected=(201,))['id'] == metadata['id']
    assert request('/api/v1/admin/midis', 'POST', {**creation, 'title': 'Changed'}, token, expected=(409,))['error']['code'] == 'IDEMPOTENCY_CONFLICT'
    delete_path = '/api/v1/admin/midis/' + metadata['id']
    request(delete_path, 'DELETE', {'revision': 1}, expected=(401,))
    for invalid in ({}, {'revision': 0}, {'revision': '1'}, {'revision': 1, 'extra': True}):
        request(delete_path, 'DELETE', invalid, token, expected=(400,))
    assert request(delete_path, 'DELETE', {'revision': 2}, token, expected=(409,))['error']['code'] == 'STALE_ENTRY'
    assert request(delete_path, 'DELETE', {'revision': 1}, token)['deleted_id'] == metadata['id']
    request('/api/v1/midis/' + creation['slug'], expected=(404,))
    request(delete_path, 'DELETE', {'revision': 1}, token, expected=(404,))
    assert request('/api/v1/admin/midis', 'POST', creation, token, expected=(410,))['error']['code'] == 'CREATION_DELETED'
    person = request('/api/v1/admin/people', 'POST', {'display_name': 'Delete smoke', 'biography': None, 'aliases': ['Old']}, token, expected=(201,))['person']
    person_path = '/api/v1/admin/people/' + person['id']
    request(person_path, 'DELETE', {'revision': 1}, expected=(401,))
    request(person_path, 'DELETE', {'revision': 0}, token, expected=(400,))
    assert request(person_path, 'DELETE', {'revision': 2}, token, expected=(409,))['error']['code'] == 'STALE_PERSON'
    request(person_path, 'DELETE', {'revision': 1}, token)
    request('/api/v1/people/' + person['id'], expected=(404,))
    print('PASS: authenticated revision-checked MIDI/person deletion and deleted creation replay rejection')
    combined = {**draft, 'slug': 'create-file-' + uuid.uuid4().hex, 'request_id': str(uuid.uuid4()),
                'distribution_permission': 'permission_granted', 'file': {
                    'filename': '一起保存.mid', 'content_base64': base64.b64encode(midi(80)).decode(), 'rights_confirmed': True}}
    request('/api/v1/admin/midis', 'POST', combined, expected=(401,))
    if args.expect_disabled:
        assert request('/api/v1/admin/midis', 'POST', combined, token, expected=(503,))['error']['code'] == 'IMPORT_DISABLED'
        request('/api/v1/midis/' + combined['slug'], expected=(404,))
    else:
        for file_change, status in [({'rights_confirmed': False}, 400), ({'content_base64': '!!!!'}, 400),
                                    ({'content_base64': base64.b64encode(b'invalid').decode()}, 400),
                                    ({'filename': '../file.mid'}, 400),
                                    ({'content_base64': base64.b64encode(b'x' * 1048577).decode()}, 413)]:
            request('/api/v1/admin/midis', 'POST', {**combined, 'file': {**combined['file'], **file_change}}, token, expected=(status,))
            request('/api/v1/midis/' + combined['slug'], expected=(404,))
        request('/api/v1/admin/midis', 'POST', {key: value for key, value in combined.items() if key != 'request_id'}, token, expected=(400,))
        created = request('/api/v1/admin/midis', 'POST', combined, token, expected=(201,))
        with ThreadPoolExecutor(max_workers=2) as pool:
            retries = list(pool.map(lambda _: request('/api/v1/admin/midis', 'POST', combined, token, expected=(201,)), range(2)))
        assert all(item['id'] == created['id'] for item in retries)
        detail = request('/api/v1/midis/' + combined['slug'])
        assert len(detail['files']) == 1 and detail['files'][0]['download_available']
        assert detail['files'][0]['original_filename'] == '一起保存.mid'
        duplicate = {**combined, 'slug': combined['slug'] + '-duplicate', 'request_id': str(uuid.uuid4())}
        assert request('/api/v1/admin/midis', 'POST', duplicate, token, expected=(409,))['error']['code'] == 'FILE_OWNERSHIP_CONFLICT'
        request('/api/v1/midis/' + duplicate['slug'], expected=(404,))
        overview = request('/api/v1/catalog/overview')
        assert sum(overview['stats']['statuses'].values()) == overview['stats']['entries']
        assert overview['stats']['files'] >= 1
        assert overview['stats']['with_files'] >= overview['stats']['downloadable'] >= 1
        entries = request('/api/v1/catalog/entries?page=1&pageSize=1')
        assert len(entries['data']) == 1 and entries['pagination']['total'] == overview['stats']['entries']
        assert 'file_count' in entries['data'][0] and 'downloadable_file_count' in entries['data'][0]
        request('/api/v1/people?page=1&pageSize=1')
        for by in ('author', 'source'):
            groups = request('/api/v1/catalog/groups?by=' + by)
            assert groups['data']
            unassigned = request('/api/v1/catalog/entries?missing=' + by)
            assert unassigned['pagination']['total'] >= 1
        for query in ('page=0', 'pageSize=101', 'status=invalid', 'person=9223372036854775808', 'sort=random', 'missing=other'):
            request('/api/v1/catalog/entries?' + query, expected=(400,))
        referenced = request('/api/v1/admin/people', 'POST', {'display_name': 'Referenced person', 'biography': None, 'aliases': []}, token, expected=(201,))['person']
        entry_path = '/api/v1/admin/midis/' + created['id']
        person_path = '/api/v1/admin/people/' + referenced['id']
        request(entry_path + '/credits', 'PUT', {'revision': 1, 'credits': [{'person_id': referenced['id'], 'role': 'composer'}]}, token)
        assert request(person_path, 'DELETE', {'revision': 1}, token, expected=(409,))['error']['code'] == 'PERSON_IN_USE'
        assert request(entry_path, 'DELETE', {'revision': 1}, token, expected=(409,))['error']['code'] == 'STALE_ENTRY'
        request(entry_path, 'DELETE', {'revision': 2}, token)
        request('/api/v1/midis/' + combined['slug'] + '/files/' + detail['files'][0]['id'] + '/download', expected=(404,))
        assert request('/api/v1/admin/midis', 'POST', combined, token, expected=(410,))['error']['code'] == 'CREATION_DELETED'
        request(person_path, 'DELETE', {'revision': 1}, token)
        print('PASS: atomic create, validation rollback, safe replay, hash conflicts, catalog and deletion of file-bearing entries')
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
    download_path = '/api/v1/midis/' + draft['slug'] + '/files/' + saved['file']['id'] + '/download'
    assert public['files'][0]['download_available'] is False
    assert request(download_path, expected=(403,))['error']['code'] == 'DOWNLOAD_NOT_ALLOWED'
    allowed = {**draft, 'revision': current['entry']['revision'], 'distribution_permission': 'permission_granted'}
    updated = request('/api/v1/admin/midis/' + first['id'], 'PUT', allowed, token)
    assert request('/api/v1/midis/' + draft['slug'])['files'][0]['download_available'] is True
    with opener.open(args.api.rstrip('/') + download_path, timeout=60) as response:
        raw = response.read()
        assert response.status == 200 and raw == midi()
        assert response.headers['Content-Type'].split(';')[0] == 'audio/midi'
        assert response.headers.get_all('Content-Length') == [str(len(raw))]
        assert response.headers['X-Content-Type-Options'] == 'nosniff'
        assert 'no-store' in response.headers['Cache-Control']
        disposition = response.headers['Content-Disposition']
        assert disposition.startswith('attachment;')
        assert urllib.parse.unquote(disposition.split("filename*=UTF-8''")[1]) == '测试+乐曲.MID'
    request('/api/v1/midis/' + other['slug'] + '/files/' + saved['file']['id'] + '/download', expected=(404,))
    for invalid in ('0', '-1', 'abc', '9223372036854775808'):
        request('/api/v1/midis/' + draft['slug'] + '/files/' + invalid + '/download', expected=(400,))
    request(download_path.replace(draft['slug'], 'missing-entry'), expected=(404,))
    request('/api/v1/admin/midis/' + first['id'], 'PUT', {**allowed, 'revision': updated['revision'], 'distribution_permission': 'metadata_only'}, token)
    assert request(download_path, expected=(403,))['error']['code'] == 'DOWNLOAD_NOT_ALLOWED'
    print('PASS: import validation, dedupe, ownership, revision, anonymous exact-byte download, filenames and distribution restrictions')


if __name__ == '__main__':
    main()
