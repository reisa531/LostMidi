"""Verify people and credit writes using an isolated test backend; leaves test records."""
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
        assert status in expected, f'{method} {path}: expected {expected}, got {status}'
        return json.loads(payload)

    credentials = {'username': os.environ['ADMIN_TEST_USERNAME'], 'password': os.environ['ADMIN_TEST_PASSWORD']}
    token = request('/api/v1/admin/login', 'POST', credentials)['token']
    for path, method in (('/api/v1/admin/people', 'GET'), ('/api/v1/admin/people', 'POST'),
                         ('/api/v1/admin/people/1', 'PUT'), ('/api/v1/admin/midis/1/credits', 'GET'),
                         ('/api/v1/admin/midis/1/credits', 'PUT')):
        request(path, method, {} if method != 'GET' else None, (401,), False)
    draft = {'display_name': 'people-check-' + uuid.uuid4().hex, 'biography': '测试资料', 'aliases': ['Old Name', '历史昵称']}
    for change in ({'display_name': '  '}, {'aliases': ['same', ' same ']}, {'aliases': ['']},
                   {'aliases': [str(n) for n in range(51)]}, {'aliases': [3]}, {'extra': True}, {'biography': 'x' * 20001}):
        request('/api/v1/admin/people', 'POST', {**draft, **change}, (400,))
    created = request('/api/v1/admin/people', 'POST', draft, (201,))
    person_id = created['person']['id']
    person_path = '/api/v1/admin/people/' + person_id
    assert created['aliases'] == draft['aliases']
    assert created['person']['revision'] == 1
    same_name = request('/api/v1/admin/people', 'POST', draft, (201,))
    assert same_name['person']['id'] != person_id
    assert request('/api/v1/admin/people?pageSize=1')['pagination']['pageSize'] == 1
    request('/api/v1/admin/people?page=0', expected=(400,))
    changed = {**draft, 'display_name': draft['display_name'] + ' 修改', 'aliases': ['新昵称'], 'revision': 1}
    edited = request(person_path, 'PUT', changed)
    assert edited['person']['revision'] == 2
    assert request('/api/v1/people/' + person_id)['aliases'] == ['新昵称']
    assert request(person_path, 'PUT', changed, (409,))['error']['code'] == 'STALE_PERSON'
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda name: request(person_path, 'PUT', {**changed, 'display_name': name, 'revision': 2}, (200, 409)), ['Concurrent Person A', 'Concurrent Person B']))
    assert sum('person' in result for result in results) == 1
    assert sum(result.get('error', {}).get('code') == 'STALE_PERSON' for result in results) == 1
    person = request(person_path)
    request(person_path, 'PUT', {**draft, 'aliases': [], 'biography': None, 'revision': person['person']['revision']})
    assert request(person_path)['aliases'] == []

    midi = request('/api/v1/admin/midis', 'POST', {'slug': 'people-check-' + uuid.uuid4().hex, 'title': 'People integration test',
                   'archive_status': 'uncertain', 'copyright_status': 'unknown', 'distribution_permission': 'metadata_only'}, (201,))
    credit_path = '/api/v1/admin/midis/' + midi['id'] + '/credits'
    credits = [{'person_id': person_id, 'role': 'composer'}, {'person_id': person_id, 'role': 'sequencer'}]
    saved = request(credit_path, 'PUT', {'revision': midi['revision'], 'credits': credits})
    assert saved['revision'] == midi['revision'] + 1
    assert len(request('/api/v1/midis/' + midi['slug'])['credits']) == 2
    assert any(entry['id'] == midi['id'] for entry in request('/api/v1/people/' + person_id)['midis'])
    for invalid in ([credits[0], credits[0]], [{'person_id': person_id, 'role': 'invalid'}],
                    [{'person_id': '9223372036854775807', 'role': 'composer'}],
                    [{'person_id': int(person_id), 'role': 'composer'}]):
        request(credit_path, 'PUT', {'revision': saved['revision'], 'credits': invalid}, (400,))
        assert request(credit_path) == saved, 'Rejected write must preserve credits and revision'
    request(credit_path, 'PUT', {'revision': midi['revision'], 'credits': []}, (409,))
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda entries: request(credit_path, 'PUT', {'revision': saved['revision'], 'credits': entries}, (200, 409)), [credits[:1], credits[1:]]))
    assert sum('credits' in result for result in results) == 1
    latest = request(credit_path)
    request(credit_path, 'PUT', {'revision': latest['revision'], 'credits': []})
    assert request(credit_path)['credits'] == []
    assert not any(entry['id'] == midi['id'] for entry in request('/api/v1/people/' + person_id)['midis'])
    request('/api/v1/admin/people/9223372036854775807', expected=(404,))
    request('/api/v1/admin/midis/9223372036854775807/credits', expected=(404,))
    request('/api/v1/admin/logout', 'POST')
    request(person_path, expected=(401,))
    print('PASS: protected people/alias create and edit, credit replacement, rollback, public relations, concurrent revisions, revocation')


if __name__ == '__main__':
    main()
