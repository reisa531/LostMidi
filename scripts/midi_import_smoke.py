"""Admin raw-file import HTTP checks. Use ONLY a migrated disposable database and private test storage."""
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


MAX_FILE_SIZE = 15_000_000  # Decimal MB, not MiB.
UNSAFE_FILENAMES = (
    '', '.', '..', '../file.mid', 'path/file.zip', '/file', 'path\\file', 'C:\\file.mid',
    ' file.mid', 'file.mid ', 'bad\x00.mid', 'bad\t.mid', 'bad\r.mid', 'bad\n.mid',
    'bad\x1f.mid', 'bad\x7f.mid', 'bad\u0085.mid', 'bad\u009f.mid', 'a' * 256, '音' * 85 + 'a',
)


def raw_file(size, marker):
    """Deterministic non-SMF bytes, including NUL and non-UTF-8 data."""
    block = marker.encode('utf-8') + b'\x00\xff\x80\r\n' + bytes(range(256))
    return (block * ((size + len(block) - 1) // len(block)))[:size]


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

    def exact_download(path, filename, content):
        # This opener has neither a cookie jar nor Authorization headers.
        with opener.open(args.api.rstrip('/') + path, timeout=60) as response:
            raw = response.read()
            assert response.status == 200 and raw == content
            assert hashlib.sha256(raw).hexdigest() == hashlib.sha256(content).hexdigest()
            assert response.headers['Content-Type'].split(';')[0] == 'application/octet-stream'
            assert response.headers.get_all('Content-Length') == [str(len(content))]
            assert response.headers['X-Content-Type-Options'] == 'nosniff'
            assert 'no-store' in response.headers['Cache-Control']
            disposition = response.headers['Content-Disposition']
            assert disposition.startswith('attachment;')
            assert urllib.parse.unquote(disposition.split("filename*=UTF-8''")[1]) == filename

    token = request('/api/v1/admin/login', 'POST', {
        'username': os.environ['ADMIN_TEST_USERNAME'], 'password': os.environ['ADMIN_TEST_PASSWORD']})['token']
    session = request('/api/v1/admin/session', token=token)
    assert session['midi_import_enabled'] is (not args.expect_disabled)
    origin = os.environ.get('ADMIN_ORIGIN', 'http://localhost:3000')
    cookie_auth = {'Origin': origin, 'Cookie': 'lostmidi_admin=' + token}

    def rejected_upload_auth(path, body, headers=None):
        cases = [
            ('anonymous without origin', {}, 401, 'UNAUTHORIZED'),
            ('anonymous with origin', {'Origin': origin}, 401, 'UNAUTHORIZED'),
            ('missing origin', {'Cookie': cookie_auth['Cookie']}, 403, 'INVALID_ORIGIN'),
            ('wrong origin', {**cookie_auth, 'Origin': 'https://untrusted.invalid'}, 403, 'INVALID_ORIGIN'),
            ('origin must match exactly', {**cookie_auth, 'Origin': origin + '/'}, 403, 'INVALID_ORIGIN'),
            ('null origin', {**cookie_auth, 'Origin': 'null'}, 403, 'INVALID_ORIGIN'),
            ('invalid cookie', {**cookie_auth, 'Cookie': 'lostmidi_admin=invalid-session'}, 401, 'UNAUTHORIZED'),
            ('wrong cookie name', {'Origin': origin, 'Cookie': 'other_session=' + token}, 401, 'UNAUTHORIZED'),
            ('invalid bearer cannot fall back to cookie', {**cookie_auth, 'Authorization': 'Bearer invalid-session'}, 401, 'UNAUTHORIZED'),
        ]
        for label, auth, status, code in cases:
            result = request(path, 'POST', body, extra={**(headers or {}), **auth}, expected=(status,))
            assert result['error']['code'] == code, label  # Never print credentials.

    for path in ('/api/v1/admin/session', '/api/v1/admin/users', '/api/v1/admin/changes'):
        assert request(path, extra=cookie_auth, expected=(401,))['error']['code'] == 'UNAUTHORIZED'
    assert request('/api/v1/admin/people', 'POST', {}, extra=cookie_auth, expected=(401,))['error']['code'] == 'UNAUTHORIZED'
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
    request('/api/v1/admin/trash', expected=(401,))
    for kind, item in (('midi', metadata), ('person', person)):
        restore_path = '/api/v1/admin/trash/' + kind + '/' + item['id'] + '/restore'
        request(restore_path, 'POST', expected=(401,))
        trash = request('/api/v1/admin/trash?pageSize=100', token=token)
        assert any(row['entity_type'] == kind and row['entity_id'] == item['id'] for row in trash['data'])
        assert request(restore_path, 'POST', token=token)['restored_id'] == item['id']
        assert request(restore_path, 'POST', token=token, expected=(404,))['error']['code'] == 'TRASH_RECORD_NOT_FOUND'
        trash = request('/api/v1/admin/trash?pageSize=100', token=token)
        assert not any(row['entity_type'] == kind and row['entity_id'] == item['id'] for row in trash['data'])
        actions = [row['action'] for row in trash['audit'] if row['entity_type'] == kind and row['entity_id'] == item['id']]
        assert sorted(actions) == ['delete', 'restore']
    restored = request('/api/v1/admin/midis/' + metadata['id'], token=token)
    assert restored['revision'] == 3 and restored['title'] == creation['title']
    assert request('/api/v1/admin/midis', 'POST', creation, token, expected=(201,))['id'] == metadata['id']
    restored_person = request(person_path, token=token)
    assert restored_person['person']['revision'] == 3 and restored_person['aliases'] == ['Old']
    print('PASS: authenticated soft deletion, deleted replay rejection, restore, retained aliases and audit history')
    combined_bytes = raw_file(1024, 'atomic-' + uuid.uuid4().hex)
    combined = {**draft, 'slug': 'create-file-' + uuid.uuid4().hex, 'request_id': str(uuid.uuid4()),
                'distribution_permission': 'permission_granted', 'file': {
                    'filename': '一起保存.zip', 'content_base64': base64.b64encode(combined_bytes).decode(), 'rights_confirmed': True}}
    rejected_upload_auth('/api/v1/admin/midis', combined)
    request('/api/v1/midis/' + combined['slug'], expected=(404,))
    if args.expect_disabled:
        assert request('/api/v1/admin/midis', 'POST', combined, token, expected=(503,))['error']['code'] == 'IMPORT_DISABLED'
        assert request('/api/v1/admin/midis', 'POST', combined, extra=cookie_auth, expected=(503,))['error']['code'] == 'IMPORT_DISABLED'
        request('/api/v1/midis/' + combined['slug'], expected=(404,))
    else:
        invalid_files = [
            ({'rights_confirmed': False}, 400, 'RIGHTS_CONFIRMATION_REQUIRED'),
            ({'content_base64': '!!!!'}, 400, 'INVALID_FILE'),
            ({'content_base64': ''}, 400, 'INVALID_FILE'),
            ({'content_base64': base64.b64encode(b'x' * (MAX_FILE_SIZE + 1)).decode()}, 413, 'FILE_TOO_LARGE'),
        ] + [({'filename': name}, 400, 'INVALID_FILE') for name in UNSAFE_FILENAMES]
        for file_change, status, code in invalid_files:
            result = request('/api/v1/admin/midis', 'POST', {**combined, 'file': {**combined['file'], **file_change}}, token, expected=(status,))
            assert result['error']['code'] == code
            request('/api/v1/midis/' + combined['slug'], expected=(404,))
        request('/api/v1/admin/midis', 'POST', {key: value for key, value in combined.items() if key != 'request_id'}, token, expected=(400,))
        created = request('/api/v1/admin/midis', 'POST', combined, extra=cookie_auth, expected=(201,))
        with ThreadPoolExecutor(max_workers=2) as pool:
            retries = list(pool.map(lambda _: request('/api/v1/admin/midis', 'POST', combined, token,
                extra={'Origin': 'https://untrusted.invalid'}, expected=(201,)), range(2)))
        assert all(item['id'] == created['id'] for item in retries)
        changed_file = {**combined, 'file': {**combined['file'], 'content_base64': base64.b64encode(b'different raw bytes').decode()}}
        assert request('/api/v1/admin/midis', 'POST', changed_file, token, expected=(409,))['error']['code'] == 'IDEMPOTENCY_CONFLICT'
        detail = request('/api/v1/midis/' + combined['slug'])
        assert len(detail['files']) == 1 and detail['files'][0]['download_available']
        assert detail['files'][0]['original_filename'] == combined['file']['filename']
        assert detail['files'][0]['sha256'] == hashlib.sha256(combined_bytes).hexdigest()
        exact_download('/api/v1/midis/' + combined['slug'] + '/files/' + detail['files'][0]['id'] + '/download',
                       combined['file']['filename'], combined_bytes)
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
        assert request(person_path, 'DELETE', {'revision': 1}, token, expected=(409,))['error']['code'] == 'PERSON_IN_USE'
        assert request('/api/v1/admin/midis', 'POST', duplicate, token, expected=(409,))['error']['code'] == 'FILE_OWNERSHIP_CONFLICT'
        search_path = '/api/v1/catalog/entries?q=' + urllib.parse.quote(combined['slug'])
        assert request(search_path)['pagination']['total'] == 0
        request('/api/v1/admin/trash/midi/' + created['id'] + '/restore', 'POST', token=token)
        restored = request(entry_path, token=token)
        assert restored['revision'] == 4
        restored_detail = request('/api/v1/midis/' + combined['slug'])
        assert restored_detail['files'] == detail['files']
        assert request(search_path)['pagination']['total'] == 1
        credits = request(entry_path + '/credits', token=token)
        assert len(credits['credits']) == 1 and credits['credits'][0]['person_id'] == referenced['id']
        download = '/api/v1/midis/' + combined['slug'] + '/files/' + detail['files'][0]['id'] + '/download'
        exact_download(download, combined['file']['filename'], combined_bytes)
        request(entry_path + '/credits', 'PUT', {'revision': restored['revision'], 'credits': []}, token)
        request(person_path, 'DELETE', {'revision': 1}, token)
        boundary_bytes = raw_file(MAX_FILE_SIZE, 'atomic-boundary-' + uuid.uuid4().hex)
        boundary = {**combined, 'slug': 'create-limit-' + uuid.uuid4().hex, 'request_id': str(uuid.uuid4()),
                    'file': {'filename': '音' * 85, 'content_base64': base64.b64encode(boundary_bytes).decode(), 'rights_confirmed': True}}
        assert len(boundary['file']['filename'].encode('utf-8')) == 255
        boundary_entry = request('/api/v1/admin/midis', 'POST', boundary, extra=cookie_auth, expected=(201,))
        boundary_detail = request('/api/v1/midis/' + boundary['slug'])
        assert boundary_detail['entry']['id'] == boundary_entry['id'] and len(boundary_detail['files']) == 1
        boundary_file = boundary_detail['files'][0]
        assert boundary_file['file_size'] == MAX_FILE_SIZE
        assert boundary_file['sha256'] == hashlib.sha256(boundary_bytes).hexdigest()
        assert boundary_file['original_filename'] == boundary['file']['filename']
        exact_download('/api/v1/midis/' + boundary['slug'] + '/files/' + boundary_file['id'] + '/download',
                       boundary['file']['filename'], boundary_bytes)
        print('PASS: atomic arbitrary-file creation, 15,000,000-byte/255-byte-name boundaries, replay, ownership and restore')
    first = request('/api/v1/admin/midis', 'POST', draft, token, expected=(201,))
    other = request('/api/v1/admin/midis', 'POST', {**draft, 'slug': draft['slug']+'-other'}, token, expected=(201,))
    path = '/api/v1/admin/midis/' + first['id'] + '/files'
    headers = {'Content-Type': 'application/octet-stream', 'X-File-Name': urllib.parse.quote('测试+乐曲.MID'),
               'X-Entry-Revision': '1', 'X-Rights-Confirmed': 'true'}
    assert request(path, expected=(401,))['error']['code'] == 'UNAUTHORIZED'
    assert request(path, extra=cookie_auth, expected=(401,))['error']['code'] == 'UNAUTHORIZED'
    rejected_upload_auth(path, midi(), headers)
    # Cookie permission is limited to the two POST endpoints, not metadata edits/deletes.
    for method, body in [('PUT', {**draft, 'revision': 1}), ('DELETE', {'revision': 1})]:
        assert request('/api/v1/admin/midis/' + first['id'], method, body, extra=cookie_auth,
                       expected=(401,))['error']['code'] == 'UNAUTHORIZED'
    initial = request(path, token=token)
    if args.expect_disabled:
        assert not initial['enabled'] and initial['files'] == []
        assert request(path, 'POST', midi(), token, headers, (503,))['error']['code'] == 'IMPORT_DISABLED'
        assert request(path, 'POST', midi(), extra={**headers, **cookie_auth}, expected=(503,))['error']['code'] == 'IMPORT_DISABLED'
        assert request(path, token=token)['entry']['revision'] == 1
        print('PASS: disabled imports reject Bearer/cookie writes while metadata remains accessible')
        return
    assert initial['enabled'] and initial['max_file_size'] == MAX_FILE_SIZE and initial['files'] == []
    invalid_uploads = [
        ({'X-Rights-Confirmed': 'false'}, midi(), 400, 'RIGHTS_CONFIRMATION_REQUIRED'),
        ({'X-File-Name': '%ZZ.mid'}, midi(), 400, 'INVALID_FILE'),
        ({'X-File-Name': '%FF.mid'}, midi(), 400, 'INVALID_FILE'),
        ({'X-Entry-Revision': '0'}, midi(), 400, 'INVALID_INPUT'),
        ({'X-Entry-Revision': '9223372036854775808'}, midi(), 400, 'INVALID_INPUT'),
        ({'Content-Type': 'application/json'}, midi(), 415, 'INVALID_FILE'),
        ({}, b'', 400, 'INVALID_FILE'),
        ({}, b'x' * (MAX_FILE_SIZE + 1), 413, 'FILE_TOO_LARGE'),
    ] + [({'X-File-Name': urllib.parse.quote(name, safe='')}, midi(), 400, 'INVALID_FILE') for name in UNSAFE_FILENAMES]
    for extra, body, status, code in invalid_uploads:
        result = request(path, 'POST', body, token, {**headers, **extra}, (status,))
        assert result['error']['code'] == code, (extra, len(body), result['error']['code'], code)
        unchanged = request(path, token=token)
        assert unchanged['files'] == [] and unchanged['entry']['revision'] == 1
    saved = request(path, 'POST', midi(), extra={**headers, **cookie_auth})
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
    exact_download(download_path, '测试+乐曲.MID', midi())
    request('/api/v1/midis/' + other['slug'] + '/files/' + saved['file']['id'] + '/download', expected=(404,))
    for invalid in ('0', '-1', 'abc', '9223372036854775808'):
        request('/api/v1/midis/' + draft['slug'] + '/files/' + invalid + '/download', expected=(400,))
    request(download_path.replace(draft['slug'], 'missing-entry'), expected=(404,))
    revision = updated['revision']
    download_paths = [download_path]
    # Extensions, the MThd magic and SMF structure no longer constrain raw uploads.
    accepted = [
        ('file.zip', midi(79)),
        ('not-midi.mid', raw_file(1024, 'no-magic-' + uuid.uuid4().hex)),
        ('broken.midi', b'MThd\x00\x00\x00\x06\xff\xff' + uuid.uuid4().bytes),
        ('no-extension', b'\xff'),
        ('音' * 85, raw_file(MAX_FILE_SIZE, 'raw-boundary-' + uuid.uuid4().hex)),
    ]
    for filename, content in accepted:
        result = request(path, 'POST', content, extra={**headers, **cookie_auth,
            'X-File-Name': urllib.parse.quote(filename, safe=''), 'X-Entry-Revision': str(revision)})
        assert not result['duplicate'] and result['revision'] == revision + 1
        revision = result['revision']
        registered = result['file']
        assert registered['file_size'] == len(content)
        assert registered['original_filename'] == filename
        assert registered['sha256'] == hashlib.sha256(content).hexdigest()
        public_file = next(item for item in request('/api/v1/midis/' + draft['slug'])['files'] if item['id'] == registered['id'])
        assert public_file['download_available'] and public_file['sha256'] == registered['sha256']
        accepted_path = '/api/v1/midis/' + draft['slug'] + '/files/' + registered['id'] + '/download'
        exact_download(accepted_path, filename, content)
        download_paths.append(accepted_path)
    request('/api/v1/admin/midis/' + first['id'], 'PUT', {**allowed, 'revision': revision, 'distribution_permission': 'metadata_only'}, token)
    for revoked in download_paths:
        assert request(revoked, expected=(403,))['error']['code'] == 'DOWNLOAD_NOT_ALLOWED'
    assert not any(item['download_available'] for item in request('/api/v1/midis/' + draft['slug'])['files'])
    print('PASS: arbitrary bytes, 1/15,000,000/+1 size bounds, safe UTF-8 names, cookie origin/auth, dedupe, exact SHA and revocation')


if __name__ == '__main__':
    main()
