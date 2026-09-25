"""Role and review HTTP smoke. Run only with a disposable local database."""
import argparse
import base64
import hashlib
import json
import os
import secrets
import struct
import urllib.error
import urllib.request
import uuid
from urllib.parse import quote, unquote, urlsplit
from midi_import_smoke import MAX_FILE_SIZE, raw_file


def midi_file(marker):
    marker_bytes = marker.encode("ascii")
    events = bytes([0, 0xFF, 0x01, len(marker_bytes)]) + marker_bytes + bytes([0, 0x90, 60, 100, 0, 0xFF, 0x2F, 0])
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
            response = opener.open(req, timeout=60)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            data = response.read()
            # Login/invitation responses can contain secrets; never include their bodies.
            assert response.status == expected, f"{method} {path}: {response.status}, expected {expected}"
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

    origin = os.environ.get("ADMIN_ORIGIN", "http://localhost:3000")
    cookie_auth = {"Origin": origin, "Cookie": "lostmidi_admin=" + admin_token}

    def changes(token):
        rows = request("/api/v1/admin/changes", token=token)
        for item in rows:
            assert isinstance(item["payload"], str), "Review payload must remain a JSON string"
            payload = json.loads(item["payload"])
            assert isinstance(payload, dict) and "content_base64" not in payload
            if isinstance(payload.get("file"), dict):
                assert "content_base64" not in payload["file"]
        return rows

    def proposed_payload(change_id):
        return json.loads(next(item for item in changes(admin_token) if item["id"] == change_id)["payload"])

    def propose(path, method, body, change_type, expected=200, headers=None, cookie=False):
        outgoing = {**(headers or {}), **(cookie_auth if cookie else {})}
        result = request(path, method, body, None if cookie else admin_token, expected, outgoing)
        assert result["status"] == "pending" and result["request_id"]
        for actor in (admin_token, super_token):
            assert any(item["id"] == result["request_id"] and item["type"] == change_type and item["status"] == "pending"
                       for item in changes(actor))
        denied = request("/api/v1/admin/changes/" + result["request_id"] + "/review", "POST", {"decision": "approve"}, admin_token, 403)
        assert denied["error"]["code"] == "FORBIDDEN"
        return result["request_id"]

    def approve(change_id):
        result = request("/api/v1/admin/changes/" + change_id + "/review", "POST", {"decision": "approve", "note": "isolated smoke"}, super_token)
        assert result["status"] == "approved"
        assert any(item["id"] == change_id and item["status"] == "approved" for item in changes(admin_token))

    def reject(change_id):
        result = request("/api/v1/admin/changes/" + change_id + "/review", "POST", {"decision": "reject", "note": "isolated smoke"}, super_token)
        assert result["status"] == "rejected"
        assert any(item["id"] == change_id and item["status"] == "rejected" for item in changes(admin_token))

    def public_download(slug, file, content):
        path = "/api/v1/midis/" + slug + "/files/" + file["id"] + "/download"
        with opener.open(args.api.rstrip("/") + path, timeout=60) as response:
            downloaded = response.read()
            assert response.status == 200 and downloaded == content
            assert hashlib.sha256(downloaded).hexdigest() == file["sha256"]
            assert response.headers["Content-Type"].split(";")[0] == "application/octet-stream"
            assert response.headers.get_all("Content-Length") == [str(len(content))]
            assert response.headers["X-Content-Type-Options"] == "nosniff"
            assert "no-store" in response.headers["Cache-Control"]
            disposition = response.headers["Content-Disposition"]
            assert disposition.startswith("attachment;")
            assert unquote(disposition.split("filename*=UTF-8''")[1]) == file["original_filename"]

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

    # Evidence stays at 1 MiB, independently of the relaxed music-file limit.
    evidence_limit = 1024 * 1024
    text_block = ("evidence-" + marker + "\n").encode()
    text = (text_block * ((evidence_limit + len(text_block) - 1) // len(text_block)))[:evidence_limit]
    evidence_headers = {"Content-Type": "application/octet-stream", "X-File-Name": "boundary.txt",
                        "X-Evidence-Media-Type": "text/plain", "X-Entry-Revision": str(history["entry"]["revision"])}
    evidence_path = base + "/sources/" + source_id + "/evidence"
    before_changes = {item["id"] for item in changes(admin_token)}
    for actor in (admin_token, super_token):
        result = request(evidence_path, "POST", text + b"x", actor, 413, evidence_headers)
        assert result["error"]["code"] == "INVALID_FILE"
    assert {item["id"] for item in changes(admin_token)} == before_changes
    assert request(base + "/history", token=admin_token) == history
    change = propose(evidence_path, "POST", text, "evidence.upload", 201, evidence_headers)
    assert proposed_payload(change)["filename"] == "boundary.txt"
    approve(change)
    history = request(base + "/history", token=admin_token)
    boundary_evidence = next(item for item in history["historical_sources"][0]["evidence_files"] if item["filename"] == "boundary.txt")
    assert boundary_evidence["file_size"] == evidence_limit
    assert boundary_evidence["sha256"] == hashlib.sha256(text).hexdigest()
    assert request(base + "/evidence/" + boundary_evidence["id"], token=admin_token, binary=True) == text

    midi_bytes = midi_file(marker)
    change = propose(base + "/files", "POST", midi_bytes, "file.import", 200,
                     {"Content-Type": "application/octet-stream", "X-File-Name": "proof.mid",
                      "X-Entry-Revision": str(history["entry"]["revision"]), "X-Rights-Confirmed": "true"})
    approve(change)
    files = request(base + "/files", token=admin_token)["files"]
    assert len(files) == 1 and files[0]["sha256"] == hashlib.sha256(midi_bytes).hexdigest()

    current = request(base, token=admin_token)
    allowed = {key: value for key, value in draft.items() if key != "request_id"}
    allowed.update(revision=current["revision"], distribution_permission="permission_granted")
    approve(propose(base, "PUT", allowed, "midi.update"))
    raw_bytes = raw_file(MAX_FILE_SIZE, "approved-" + marker)
    assert evidence_limit < len(raw_bytes) <= MAX_FILE_SIZE and not raw_bytes.startswith(b"MThd")
    file_headers = {"Content-Type": "application/octet-stream", "X-File-Name": quote("审核原始.zip", safe=""),
                    "X-Entry-Revision": str(request(base, token=admin_token)["revision"]), "X-Rights-Confirmed": "true"}
    before_files = request(base + "/files", token=admin_token)
    change = propose(base + "/files", "POST", raw_bytes, "file.import", headers=file_headers, cookie=True)
    proposed = proposed_payload(change)
    assert proposed["filename"] == "审核原始.zip" and proposed["rights_confirmed"] is True
    assert request(base + "/files", token=admin_token) == before_files
    approve(change)
    after_files = request(base + "/files", token=admin_token)
    assert len(after_files["files"]) == 2 and after_files["entry"]["revision"] == before_files["entry"]["revision"] + 1
    raw_saved = next(item for item in after_files["files"] if item["original_filename"] == "审核原始.zip")
    assert raw_saved["file_size"] == len(raw_bytes) and raw_saved["sha256"] == hashlib.sha256(raw_bytes).hexdigest()
    public_download(slug, raw_saved, raw_bytes)

    rejected_bytes = raw_file(2_000_001, "rejected-" + marker)
    rejected_headers = {**file_headers, "X-File-Name": "not-midi.mid", "X-Entry-Revision": str(after_files["entry"]["revision"])}
    rejected = propose(base + "/files", "POST", rejected_bytes, "file.import", headers=rejected_headers, cookie=True)
    assert request(base + "/files", token=admin_token) == after_files
    reject(rejected)
    assert request(base + "/files", token=admin_token) == after_files
    assert all(item["sha256"] != hashlib.sha256(rejected_bytes).hexdigest() for item in request("/api/v1/midis/" + slug)["files"])

    # Combined creation also queues raw bytes, but neither review list exposes them.
    combined_bytes = raw_file(2_000_003, "create-approved-" + marker)
    combined = {**draft, "slug": "review-file-" + marker, "request_id": str(uuid.uuid4()),
                "distribution_permission": "permission_granted", "file": {
                    "filename": "一起审核.raw", "content_base64": base64.b64encode(combined_bytes).decode(), "rights_confirmed": True}}
    change = propose("/api/v1/admin/midis", "POST", combined, "midi.create", 201, cookie=True)
    proposed = proposed_payload(change)
    assert proposed["slug"] == combined["slug"] and proposed["file"]["filename"] == "一起审核.raw"
    assert proposed["file"]["rights_confirmed"] is True
    request("/api/v1/midis/" + combined["slug"], expected=404)
    approve(change)
    created = request("/api/v1/midis/" + combined["slug"])
    assert len(created["files"]) == 1
    assert created["files"][0]["original_filename"] == "一起审核.raw"
    assert created["files"][0]["file_size"] == len(combined_bytes)
    assert created["files"][0]["sha256"] == hashlib.sha256(combined_bytes).hexdigest()
    public_download(combined["slug"], created["files"][0], combined_bytes)
    rejected_creation = {**combined, "slug": "review-rejected-file-" + marker, "request_id": str(uuid.uuid4()),
                         "file": {**combined["file"], "content_base64": base64.b64encode(rejected_bytes).decode()}}
    rejected = propose("/api/v1/admin/midis", "POST", rejected_creation, "midi.create", 201, cookie=True)
    request("/api/v1/midis/" + rejected_creation["slug"], expected=404)
    reject(rejected)
    request("/api/v1/midis/" + rejected_creation["slug"], expected=404)

    approve(propose("/api/v1/admin/people/" + person["id"], "DELETE", {"revision": 1}, "person.delete"))
    assert request("/api/v1/people/" + person["public_id"], expected=404)["error"]["code"] == "PERSON_NOT_FOUND"
    approve(propose("/api/v1/admin/trash/person/" + person["id"] + "/restore", "POST", None, "person.restore"))
    assert request("/api/v1/people/" + person["public_id"])["person"]["id"] == person["id"]
    current = request(base, token=admin_token)
    approve(propose(base, "DELETE", {"revision": current["revision"]}, "midi.delete"))
    assert request("/api/v1/midis/by-id/" + entry["public_id"], expected=404)["error"]["code"] == "MIDI_NOT_FOUND"
    approve(propose("/api/v1/admin/trash/midi/" + midi_id + "/restore", "POST", None, "midi.restore"))
    assert request("/api/v1/midis/by-id/" + entry["public_id"])["entry"]["id"] == midi_id

    rejected_name = "被驳回的人物 " + marker
    rejected = propose("/api/v1/admin/people", "POST",
                       {"display_name": rejected_name, "biography": None, "aliases": []}, "person.create", 201)
    reject(rejected)
    assert not any(row["display_name"] == rejected_name for row in request(
        "/api/v1/admin/people?page=1&pageSize=100", token=admin_token)["data"])

    user_path = "/api/v1/admin/users/" + invitation["id"]
    request(user_path, "PUT", {"role": "super_admin", "status": "active"}, super_token)
    assert request("/api/v1/admin/session", token=admin_token)["role"] == "super_admin"
    assert isinstance(request("/api/v1/admin/users", token=admin_token), list)
    request(user_path, "PUT", {"role": "admin", "status": "active"}, super_token)
    assert request("/api/v1/admin/session", token=admin_token)["role"] == "admin"
    assert request("/api/v1/admin/users", token=admin_token, expected=403)["error"]["code"] == "FORBIDDEN"
    request(user_path, "PUT", {"role": "admin", "status": "disabled"}, super_token)
    assert request("/api/v1/admin/session", token=admin_token, expected=401)["error"]["code"] == "UNAUTHORIZED"
    assert request("/api/v1/admin/login", "POST", {"username": username, "password": password}, expected=401)["error"]["code"] == "INVALID_CREDENTIALS"
    assert request(base + "/files", "POST", raw_bytes, expected=401,
                   headers={**file_headers, **cookie_auth})["error"]["code"] == "UNAUTHORIZED"
    assert request("/api/v1/admin/midis", "POST", combined, expected=401,
                   headers=cookie_auth)["error"]["code"] == "UNAUTHORIZED"
    print("PASS: roles/revoked cookies; >1 MiB raw-file import/create approval and rejection; redacted review lists; 1 MiB evidence; deletion/restore")


if __name__ == "__main__":
    main()
