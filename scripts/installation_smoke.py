"""One-time installation tests: ONLY for a fresh, migrated, disposable backend/database."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import os
import secrets
import urllib.error
import urllib.request


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--api', default='http://127.0.0.1:8080')
    parser.add_argument('--allow-install', action='store_true', required=True)
    args = parser.parse_args()
    key = os.environ['INSTALLATION_TEST_TOKEN']
    password = secrets.token_urlsafe(32)
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def request(path, method='GET', body=None, expected=(200,), installation_token=None, bearer=None):
        headers = {'Content-Type': 'application/json'}
        if installation_token is not None:
            headers['X-Installation-Token'] = installation_token
        if bearer:
            headers['Authorization'] = 'Bearer ' + bearer
        req = urllib.request.Request(args.api.rstrip('/') + path, method=method, headers=headers,
                                     data=None if body is None else json.dumps(body).encode())
        try:
            response = opener.open(req, timeout=20)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            code, raw, cache = response.status, response.read(), response.headers.get('Cache-Control', '')
        assert code in expected, f'{method} {path}: expected {expected}, got {code}'
        assert 'no-store' in cache
        assert key.encode() not in raw and password.encode() not in raw
        return code, json.loads(raw)

    endpoint = '/api/v1/installation'
    initial = request(endpoint)[1]
    assert initial['installed'] is False, 'Refusing to test an already installed database'
    assert initial['installation_enabled'] is True, 'Enable installation only on the disposable backend'
    assert set(initial) == {'installed', 'installation_enabled', 'site'}
    assert set(initial['site']) == {'name', 'description'}
    draft = {'site_name': 'installation-check archive', 'site_description': '安装测试站点',
             'username': 'installation-test-admin', 'password': password}
    request('/api/v1/admin/midis', 'POST', {}, (401,))
    request('/api/v1/admin/login', 'POST', {'username': draft['username'], 'password': password}, (503,))
    assert request(endpoint, 'POST', draft, (403,))[1]['error']['code'] == 'INVALID_INSTALLATION_TOKEN'
    assert request(endpoint, 'POST', draft, (403,), 'x' * 43)[1]['error']['code'] == 'INVALID_INSTALLATION_TOKEN'
    for invalid in ({'username': 'invalid user'}, {'password': 'short'}, {'unknown': True}, {'site_name': '\0'}):
        request(endpoint, 'POST', {**draft, **invalid}, (400,), key)
        assert request(endpoint)[1] == initial, 'Invalid installation changed persisted state'

    def install(name):
        return request(endpoint, 'POST', {**draft, 'site_name': name}, (201, 409), key)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(install, ['installation-check A', 'installation-check B']))
    assert sorted(code for code, _ in results) == [201, 409]
    winner = next(payload for code, payload in results if code == 201)
    assert winner['installed'] is True and winner['installation_enabled'] is False
    assert request(endpoint)[1] == winner
    assert request(endpoint, 'POST', {**draft, 'password': 'another-valid-password'}, (409,), key)[1]['error']['code'] == 'ALREADY_INSTALLED'
    assert request(endpoint)[1] == winner
    login = request('/api/v1/admin/login', 'POST', {'username': draft['username'], 'password': password})[1]
    token = login['token']
    assert request('/api/v1/admin/session', bearer=token)[1]['username'] == draft['username']
    request('/api/v1/admin/logout', 'POST', bearer=token)
    request('/api/v1/admin/session', expected=(401,), bearer=token)
    print('PASS: install authorization, strict input, atomic concurrent installation, persistent lock, response secrecy and database-admin login/logout')


if __name__ == '__main__':
    main()
