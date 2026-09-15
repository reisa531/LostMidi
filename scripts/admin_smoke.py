"""Exercise administrator APIs against a disposable migrated test database.

Creates test records (no public delete API exists). Credentials come from
ADMIN_TEST_USERNAME / ADMIN_TEST_PASSWORD, never command-line arguments.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import json
import os
import urllib.error
import urllib.request
import uuid


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api", default="http://127.0.0.1:8080")
    parser.add_argument("--allow-writes", action="store_true", required=True)
    args = parser.parse_args()

    def request(path, method="GET", body=None, token=None, expected=200):
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = "Bearer " + token
        req = urllib.request.Request(args.api + path, method=method, headers=headers,
                                     data=None if body is None else json.dumps(body).encode())
        try:
            with urllib.request.urlopen(req, timeout=15) as response:
                status, payload = response.status, response.read()
                response_headers = response.headers
        except urllib.error.HTTPError as error:
            status, payload = error.code, error.read()
            response_headers = error.headers
        expected_statuses = expected if isinstance(expected, tuple) else (expected,)
        assert status in expected_statuses, f"{method} {path}: expected {expected}, got {status}"
        assert "no-store" in response_headers.get("Cache-Control", ""), "Admin responses must not be cached"
        return json.loads(payload)

    credentials = {"username": os.environ["ADMIN_TEST_USERNAME"], "password": os.environ["ADMIN_TEST_PASSWORD"]}
    request("/api/v1/admin/session", expected=401)
    request("/api/v1/admin/midis", "POST", {}, expected=401)
    request("/api/v1/admin/midis/1", "PUT", {}, expected=401)
    request("/api/v1/admin/login", "POST", {**credentials, "password": "wrong"}, expected=401)
    session = request("/api/v1/admin/login", "POST", credentials)
    token = session["token"]
    assert len(token) == 64
    assert request("/api/v1/admin/session", token=token)["username"] == credentials["username"]
    request("/api/v1/admin/session", token="0" * 64, expected=401)

    draft = {"title": "管理员测试档案", "slug": "admin-check-" + uuid.uuid4().hex,
             "description": "Integration test only.", "estimated_year": None, "archive_status": "uncertain",
             "copyright_status": "unknown", "distribution_permission": "metadata_only", "license": None, "rights_holder": None}
    for field, value in (("title", "  "), ("slug", "Bad Slug"), ("estimated_year", 10000),
                         ("estimated_year", 1998.5), ("archive_status", "invalid"), ("title", "x" * 301)):
        request("/api/v1/admin/midis", "POST", {**draft, field: value}, token, 400)
    request("/api/v1/admin/midis", "POST", {**draft, "id": "99"}, token, 400)
    created = request("/api/v1/admin/midis", "POST", draft, token, 201)
    path = "/api/v1/admin/midis/" + created["id"]
    request("/api/v1/admin/midis", "POST", draft, token, 409)
    request(path, expected=401)
    assert request(path, token=token)["slug"] == draft["slug"]
    changed = {**draft, "title": "已编辑的测试档案", "slug": draft["slug"] + "-updated", "estimated_year": 1999, "revision": created["revision"]}
    edited = request(path, "PUT", changed, token)
    assert edited["revision"] == created["revision"] + 1
    assert request("/api/v1/midis/" + edited["slug"])["entry"]["title"] == changed["title"]
    request("/api/v1/midis/" + draft["slug"], expected=404)
    assert request(path, "PUT", changed, token, 409)["error"]["code"] == "STALE_ENTRY"
    assert request(path, token=token)["title"] == changed["title"]
    second = request("/api/v1/admin/midis", "POST", draft, token, 201)
    assert request(path, "PUT", {**changed, "slug": second["slug"], "revision": edited["revision"]}, token, 409)["error"]["code"] == "SLUG_CONFLICT"
    assert request(path, token=token) == edited, "A rejected slug change must not alter the record"
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda title: request(path, "PUT", {**changed, "title": title, "revision": edited["revision"]}, token, (200, 409)),
                                ("Concurrent edit A", "Concurrent edit B")))
    winners = [result for result in results if "revision" in result]
    conflicts = [result for result in results if "error" in result]
    assert len(winners) == len(conflicts) == 1, "Only one concurrent edit may commit"
    assert conflicts[0]["error"]["code"] == "STALE_ENTRY"
    assert winners[0]["revision"] == edited["revision"] + 1
    assert request(path, token=token) == winners[0]
    request("/api/v1/admin/midis/9223372036854775807", "PUT", changed, token, 404)

    second_token = request("/api/v1/admin/login", "POST", credentials)["token"]
    assert second_token != token
    request("/api/v1/admin/logout", "POST", token=token)
    request(path, "PUT", changed, token, 401)
    request("/api/v1/admin/session", token=token, expected=401)
    request("/api/v1/admin/session", token=second_token)
    request("/api/v1/admin/logout", "POST", token=second_token)
    limited = False
    for _ in range(12):
        try:
            request("/api/v1/admin/login", "POST", {**credentials, "password": "wrong"}, expected=401)
        except AssertionError as error:
            assert "got 429" in str(error)
            limited = True
            break
    assert limited, "Expected login rate limiting"
    print("PASS: authentication, revocation, rate limit, protected create/edit, validation, slug conflicts, concurrent revision conflicts, public visibility, no-store")


if __name__ == "__main__":
    main()
