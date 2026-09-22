"""Verify source/recovery CRUD against a disposable backend; leaves marked test records."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import os
import urllib.error
import urllib.request
import uuid


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--api', default='http://127.0.0.1:8080')
    parser.add_argument('--allow-writes', action='store_true', required=True)
    args = parser.parse_args()
    token = None
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def request(path, method='GET', body=None, expected=(200,), authenticated=True):
        headers = {'Content-Type': 'application/json'}
        if authenticated and token:
            headers['Authorization'] = 'Bearer ' + token
        req = urllib.request.Request(args.api.rstrip('/') + path, method=method, headers=headers,
                                     data=None if body is None else json.dumps(body).encode())
        try:
            with opener.open(req, timeout=20) as response:
                status, payload = response.status, response.read()
        except urllib.error.HTTPError as error:
            status, payload = error.code, error.read()
        assert status in expected, f'{method} {path}: expected {expected}, got {status}: {payload[:400]!r}'
        return json.loads(payload)

    token = request('/api/v1/admin/login', 'POST', {
        'username': os.environ['ADMIN_TEST_USERNAME'], 'password': os.environ['ADMIN_TEST_PASSWORD']})['token']
    marker = 'recovery-check-' + uuid.uuid4().hex
    person = request('/api/v1/admin/people', 'POST', {'display_name': marker, 'aliases': []}, (201,))['person']
    draft = {'slug': marker, 'title': marker, 'archive_status': 'uncertain',
             'copyright_status': 'unknown', 'distribution_permission': 'metadata_only'}
    midi = request('/api/v1/admin/midis', 'POST', draft, (201,))
    other = request('/api/v1/admin/midis', 'POST', {**draft, 'slug': marker + '-other'}, (201,))
    base = '/api/v1/admin/midis/' + midi['id']
    other_base = '/api/v1/admin/midis/' + other['id']
    routes = [('/history', 'GET'), ('/sources', 'POST'), ('/sources/1', 'PUT'), ('/sources/1', 'DELETE'),
              ('/recovery-events', 'POST'), ('/recovery-events/1', 'PUT'), ('/recovery-events/1', 'DELETE')]
    for suffix, method in routes:
        assert request(base + suffix, method, None if method == 'GET' else {}, (401,), False)['error']['code'] == 'UNAUTHORIZED'
    initial = request(base + '/history')
    assert initial['entry']['revision'] == 1 and not initial['historical_sources'] and not initial['recovery_events']
    source = {'revision': 1, 'website_name': 'Historical site', 'original_url': 'https://example.org/archive.mid',
              'first_seen_at': '1999-01-01T00:00:00.123456Z', 'last_seen_at': '2000-01-01T00:00:00Z',
              'wayback_url': 'https://web.archive.org/web/20000101/https://example.org/', 'notes': '来源说明'}
    invalid_sources = [
        {'website_name': ''}, {'website_name': 'x' * 301}, {'notes': 'x' * 20001}, {'notes': 'a\0b'},
        {'original_url': 'javascript:alert(1)'}, {'original_url': '/relative'}, {'original_url': 'https://'},
        {'original_url': 'https://user:pass@example.org/'}, {'original_url': 'https://example.org/a b'},
        {'wayback_url': 'https://example.org\\path'}, {'first_seen_at': '2025-02-29T00:00:00Z'},
        {'first_seen_at': '2000-01-01T00:00:00.000001Z'}, {'last_seen_at': '1998-12-31T23:59:59Z'},
        {'first_seen_at': '2000-01-01T00:00:00+00:00'}, {'last_seen_at': '2000-01-01T00:00:00.1234567Z'},
        {'revision': 0}, {'revision': '1'}, {'id': '7'}, {'midi_id': other['id']}, {'website_name': 4},
    ]
    for invalid in invalid_sources:
        result = request(base + '/sources', 'POST', {**source, **invalid}, (400,))
        assert result['error']['code'] == 'INVALID_INPUT'
        assert request(base + '/history') == initial, 'Invalid source changed history/revision'
    saved = request(base + '/sources', 'POST', source, (201,))
    source_id = saved['source']['id']
    assert isinstance(source_id, str) and saved['revision'] == 2
    assert saved['source']['first_seen_at'] == source['first_seen_at']
    assert saved['source']['last_seen_at'] == '2000-01-01T00:00:00.000000Z'
    assert request(base + '/sources', 'POST', source, (409,))['error']['code'] == 'STALE_ENTRY'
    source_path = base + '/sources/' + source_id
    edited = request(source_path, 'PUT', {'revision': 2, 'website_name': 'Edited site'})
    assert edited['source']['id'] == source_id and edited['revision'] == 3
    assert edited['source']['original_url'] is None and edited['source']['first_seen_at'] is None
    for method in ('PUT', 'DELETE'):
        result = request(other_base + '/sources/' + source_id, method,
                         {'revision': 1, **({'website_name': 'Wrong parent'} if method == 'PUT' else {})}, (404,))
        assert result['error']['code'] == 'SOURCE_NOT_FOUND'
        assert request(other_base + '/history')['entry']['revision'] == 1
    event = {'revision': 3, 'story': '日期与贡献者不详', 'recovered_at': None, 'recovered_by': None, 'evidence': '文字证据'}
    before = request(base + '/history')
    for invalid in ({'story': ' '}, {'recovered_by': 1}, {'recovered_by': '9223372036854775807'},
                    {'created_at': '2000-01-01T00:00:00Z'}, {'evidence': 'x' * 20001},
                    {'recovered_at': '1999-02-29T00:00:00Z'}, {'recovered_by_name': 'Untrusted'}):
        request(base + '/recovery-events', 'POST', {**event, **invalid}, (400,))
        assert request(base + '/history') == before, 'Rejected event changed history/revision'
    saved_event = request(base + '/recovery-events', 'POST', event, (201,))
    event_id = saved_event['event']['id']
    created_at = saved_event['event']['created_at']
    assert saved_event['revision'] == 4 and saved_event['event']['recovered_at'] is None
    event_path = base + '/recovery-events/' + event_id
    edited_event = request(event_path, 'PUT', {**event, 'revision': 4, 'story': '已核对的寻回记录',
        'recovered_at': '2000-02-29T12:34:56.123456Z', 'recovered_by': person['id']})
    assert edited_event['revision'] == 5
    assert edited_event['event']['id'] == event_id and edited_event['event']['created_at'] == created_at
    assert edited_event['event']['recovered_by_name'] == marker
    before = request(base + '/history')
    request(event_path, 'PUT', {**event, 'revision': 5, 'recovered_by': '9223372036854775807'}, (400,))
    assert request(base + '/history') == before
    for method in ('PUT', 'DELETE'):
        result = request(other_base + '/recovery-events/' + event_id, method,
                         {'revision': 1, **({'story': 'Wrong parent'} if method == 'PUT' else {})}, (404,))
        assert result['error']['code'] == 'RECOVERY_EVENT_NOT_FOUND'
        assert request(other_base + '/history')['entry']['revision'] == 1
    public = request('/api/v1/midis/' + marker)
    assert public['entry']['archive_status'] == 'uncertain' and not public['credits'] and not public['files']
    assert public['historical_sources'] == before['historical_sources']
    assert public['recovery_events'] == before['recovery_events']
    # Credits and basic metadata participate in the same optimistic revision.
    assert request(base + '/credits', 'PUT', {'revision': 5, 'credits': []})['revision'] == 6
    request(source_path, 'DELETE', {'revision': 5}, (409,))
    assert request(base, 'PUT', {**draft, 'revision': 6})['revision'] == 7
    request(event_path, 'DELETE', {'revision': 6}, (409,))
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda name: request(base + '/sources', 'POST',
            {'revision': 7, 'website_name': name}, (201, 409)), ['Concurrent A', 'Concurrent B']))
    assert sum('source' in item for item in results) == 1
    assert sum(item.get('error', {}).get('code') == 'STALE_ENTRY' for item in results) == 1
    latest = request(base + '/history')
    assert latest['entry']['revision'] == 8 and len(latest['historical_sources']) == 2
    # An undated event remains undated and sorts after known dates.
    unknown = request(base + '/recovery-events', 'POST', {**event, 'revision': 8}, (201,))
    events = request(base + '/history')['recovery_events']
    assert [item['id'] for item in events] == [event_id, unknown['event']['id']]
    assert events[1]['recovered_at'] is None and events[1]['recovered_by'] is None
    cleared = request(event_path, 'PUT', {'revision': 9, 'story': 'Cleared optional fields'})
    assert cleared['event']['created_at'] == created_at and cleared['event']['recovered_by'] is None
    assert cleared['event']['recovered_at'] is None and cleared['event']['evidence'] is None
    for invalid in ({}, {'revision': 10, 'id': source_id}, {'revision': 10.0}, {'revision': 9223372036854775808}):
        request(source_path, 'DELETE', invalid, (400,))
        assert request(base + '/history')['entry']['revision'] == 10
    removed = request(source_path, 'DELETE', {'revision': 10})
    assert removed == {'revision': 11, 'deleted_id': source_id}
    request(source_path, 'DELETE', {'revision': 11}, (404,))
    assert request(base + '/history')['entry']['revision'] == 11
    assert request(event_path, 'DELETE', {'revision': 11}) == {'revision': 12, 'deleted_id': event_id}
    request(event_path, 'DELETE', {'revision': 12}, (404,))
    assert request(base + '/history')['entry']['revision'] == 12
    missing = '/api/v1/admin/midis/9223372036854775807'
    request(missing + '/history', expected=(404,))
    request(missing + '/sources', 'POST', {'revision': 1, 'website_name': 'Missing'}, (404,))
    request('/api/v1/admin/logout', 'POST')
    for suffix, method in routes:
        request(base + suffix, method, None if method == 'GET' else {}, (401,))
    print('PASS: source/recovery CRUD, UTC precision, nullable dates/people, strict validation, ownership, rollback, shared/concurrent revision, public synchronization and session revocation')


if __name__ == '__main__':
    main()
