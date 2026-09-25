"""Role and review HTTP smoke. Run only with a disposable local database."""
import argparse
import hashlib
import json
import os
import secrets
import struct
import urllib.error
import urllib.request
import uuid
from urllib.parse import urlsplit


def midi_file():
    events = bytes([0, 0x90, 60, 100, 0, 0xFF, 0x2F, 0])
    return b"MThd" + struct.pack(">IHHH", 6, 0, 1, 96) + b"MTrk" + struct.pack(">I", len(events)) + events


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api", required=True)
    parser.add_argument("--allow-writes", action="store_true", required=True)
    args = parser.parse_args()
    assert urlsplit(args.api).hostname in {"127.0.0.1", "localhost"}
    assert os.environ.get("LOSTMIDI_TEST_DATABASE_URL"), "A disposable database is required"
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))

    def request(path, method="GET", body=None, token=None, expected=200, headers=None, binary=False):
        outgoing = {"Content-Type": "application/json", **(headers or {})}
        if token:
            outgoing["Authorization"] = "Bearer " + token
        if body is not None and not isinstance(body, bytes):
            body = json.dumps(body).encode("utf-8")
        req = urllib.request.Request(args.api.rstrip("/") + path, data=body, headers=outgoing, method=method)
        try:
            response = opener.open(req, timeout=30)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            data = response.read()
            assert response.status == expected, f"{method} {path}: {response.status}, expected {expected}: {data[:300]!r}"
            assert "no-store" in response.headers.get("Cache-Control", "")
            return data if binary else json.loads(data)

    super_token = request("/api/v1/admin/login", "POST", {
        "username": os.environ["ADMIN_TEST_USERNAME"], "password": os.environ["ADMIN_TEST_PASSWORD"]})["token"]
    assert request("/api/v1/admin/session", token=super_token)["role"] == "super_admin"
    assert request("/api/v1/admin/session", expected=401)["error"]["code"] == "UNAUTHORIZED"
    assert request("/api/v1/admin/people", "POST", {}, expected=401)["error"]["code"] == "UNAUTHORIZED"
    marker = uuid.uuid4().hex
    username = "review_" + marker[:12]
    invitation = request("/api/v1/admin/users", "POST", {"username": username, "role": "admin"}, super_token, 201)
    password = secrets.token_urlsafe(24)
    request("/api/v1/admin/invitations/accept", "POST", {"token": invitation["invitation_token"], "password": password})
    admin_token = request("/api/v1/admin/login", "POST", {"username": username, "password": password})["token"]
    assert request("/api/v1/admin/session", token=admin_token)["role"] == "admin"
    assert request("/api/v1/admin/users", token=admin_token, expected=403)["error"]["code"] == "FORBIDDEN"

    def propose(path, method, body, change_type, expected=200, headers=None):
        result = request(path, method, body, admin_token, expected, headers)
        assert result["status"] == "pending" and result["request_id"]
        mine = request("/api/v1/admin/changes", token=admin_token)
        assert any(item["id"] == result["request_id"] and item["type"] == change_type and item["status"] == "pending" for item in mine)
        denied = request("/api/v1/admin/changes/" + result["request_id"] + "/review", "POST", {"decision": "approve"}, admin_token, 403)
        assert denied["error"]["code"] == "FORBIDDEN"
        return result["request_id"]

    def approve(change_id):
        result = request("/api/v1/admin/changes/" + change_id + "/review", "POST", {"decision": "approve", "note": "isolated smoke"}, super_token)
        assert result["status"] == "approved"
        mine = request("/api/v1/admin/changes", token=admin_token)
        assert any(item["id"] == change_id and item["status"] == "approved" for item in mine)

    person_name = "审核测试人物 " + marker
    change = propose("/api/v1/admin/people", "POST", {"display_name": person_name, "biography": None, "aliases": []}, "person.create", 201)
    assert not any(row["display_name"] == person_name for row in request("/api/v1/admin/people?page=1&pageSize=100", token=admin_token)["data"])
    approve(change)
    person = next(row for row in request("/api/v1/admin/people?page=1&pageSize=100", token=admin_token)["data"] if row["display_name"] == person_name)
    assert person["public_id"] and person["revision"] == 1

    slug = "review-" + marker
    draft = {"request_id": str(uuid.uuid4()), "title": "审核测试 MIDI", "slug": slug,
             "description": None, "estimated_year": None, "archive_status": "uncertain",
             "copyright_status": "unknown", "distribution_permission": "metadata_only",
             "license": None, "rights_holder": None}
    change = propose("/api/v1/admin/midis", "POST", draft, "midi.create", 201)
    assert request("/api/v1/midis/" + slug, expected=404)["error"]["code"] == "MIDI_NOT_FOUND"
    approve(change)
    entry = next(row for row in request("/api/v1/midis?page=1&pageSize=100")["data"] if row["slug"] == slug)
    midi_id = entry["id"]
    assert request("/api/v1/midis/by-id/" + entry["public_id"])["entry"]["id"] == midi_id

    base = "/api/v1/admin/midis/" + midi_id
    source = {"revision": entry["revision"], "website_name": "审核测试网站", "original_url": "https://example.org/old.mid",
              "wayback_url": "https://web.archive.org/web/20000101/https://example.org/",
              "first_seen_at": None, "last_seen_at": None, "notes": "原始线索",
              "source_type": "archive", "credibility": 4, "checked_at": None}
    change = propose(base + "/sources", "POST", source, "history.source.create", 201)
    assert not request(base + "/history", token=admin_token)["historical_sources"]
    approve(change)
    history = request(base + "/history", token=admin_token)
    source_id = history["historical_sources"][0]["id"]
    assert history["historical_sources"][0]["credibility"] == 4

    pdf = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n"
    change = propose(base + "/sources/" + source_id + "/evidence", "POST", pdf, "evidence.upload", 201,
                     {"Content-Type": "application/octet-stream", "X-File-Name": "proof.pdf",
                      "X-Evidence-Media-Type": "application/pdf", "X-Entry-Revision": str(history["entry"]["revision"])})
    approve(change)
    history = request(base + "/history", token=admin_token)
    evidence = history["historical_sources"][0]["evidence_files"][0]
    assert evidence["sha256"] == hashlib.sha256(pdf).hexdigest()
    assert request(base + "/evidence/" + evidence["id"], token=admin_token, binary=True) == pdf
    assert request(base + "/evidence/" + evidence["id"], expected=401)["error"]["code"] == "UNAUTHORIZED"

    midi_bytes = midi_file()
    change = propose(base + "/files", "POST", midi_bytes, "file.import", 200,
                     {"Content-Type": "application/octet-stream", "X-File-Name": "proof.mid",
                      "X-Entry-Revision": str(history["entry"]["revision"]), "X-Rights-Confirmed": "true"})
    approve(change)
    files = request(base + "/files", token=admin_token)["files"]
    assert len(files) == 1 and files[0]["sha256"] == hashlib.sha256(midi_bytes).hexdigest()

    approve(propose("/api/v1/admin/people/" + person["id"], "DELETE", {"revision": 1}, "person.delete"))
    assert request("/api/v1/people/" + person["public_id"], expected=404)["error"]["code"] == "PERSON_NOT_FOUND"
    approve(propose("/api/v1/admin/trash/person/" + person["id"] + "/restore", "POST", None, "person.restore"))
    assert request("/api/v1/people/" + person["public_id"])["person"]["id"] == person["id"]
    current = request(base, token=admin_token)
    approve(propose(base, "DELETE", {"revision": current["revision"]}, "midi.delete"))
    assert request("/api/v1/midis/by-id/" + entry["public_id"], expected=404)["error"]["code"] == "MIDI_NOT_FOUND"
    approve(propose("/api/v1/admin/trash/midi/" + midi_id + "/restore", "POST", None, "midi.restore"))
    assert request("/api/v1/midis/by-id/" + entry["public_id"])["entry"]["id"] == midi_id
    print("PASS: visitor read-only; roles; review publication, evidence, file import, deletion and restore")


if __name__ == "__main__":
    main()
