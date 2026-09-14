"""Read-only checks against a running, demo-seeded stack. Standard library only."""

import argparse
import html
import json
import urllib.error
import urllib.request


def request(base, path, expected=200):
    try:
        with urllib.request.urlopen(base.rstrip("/") + path, timeout=15) as response:
            status, body = response.status, response.read().decode("utf-8")
    except urllib.error.HTTPError as error:
        status, body = error.code, error.read().decode("utf-8")
    assert status == expected, f"{path}: expected {expected}, got {status}"
    return body


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--api", default="http://127.0.0.1:8080")
    parser.add_argument("--frontend", default="http://127.0.0.1:3000")
    parser.add_argument("--api-only", action="store_true", help="Check backend only; do not claim frontend verification")
    args = parser.parse_args()

    assert json.loads(request(args.api, "/health")) == {"status": "ok"}
    request(args.api, "/ready")
    listing = json.loads(request(args.api, "/api/v1/midis?page=1&pageSize=1"))
    assert len(listing["data"]) == 1, "Run with SEED_DEMO=true in a development database"
    assert listing["pagination"]["page"] == 1
    assert listing["pagination"]["pageSize"] == 1
    assert listing["pagination"]["total"] >= 3
    second = json.loads(request(args.api, "/api/v1/midis?page=2&pageSize=1"))
    assert listing["data"][0]["id"] != second["data"][0]["id"]
    beyond = json.loads(request(args.api, "/api/v1/midis?page=999999&pageSize=1"))
    assert beyond["data"] == []
    assert beyond["pagination"]["total"] == listing["pagination"]["total"]

    for query in ("page=0", "page=-1", "page=abc", "pageSize=0", "pageSize=101"):
        error = json.loads(request(args.api, "/api/v1/midis?" + query, 400))
        assert set(error["error"]) == {"code", "message"}
    missing = json.loads(request(args.api, "/api/v1/midis/no-such-archive", 404))
    assert missing["error"]["code"] == "MIDI_NOT_FOUND"
    request(args.api, "/api/v1/people/0", 400)
    request(args.api, "/api/v1/people/9223372036854775807", 404)

    detail = json.loads(request(args.api, "/api/v1/midis/example-midi"))
    assert detail["entry"]["slug"] == "example-midi"
    assert isinstance(detail["entry"]["id"], str)
    for field in ("credits", "historical_sources", "recovery_events", "files"):
        assert isinstance(detail[field], list), field
    for file in detail["files"]:
        assert "storage_key" not in file
    credit = detail["credits"][0]
    person = json.loads(request(args.api, "/api/v1/people/" + credit["person_id"]))
    assert person["person"]["display_name"] == credit["display_name"]
    assert any(midi["slug"] == "example-midi" for midi in person["midis"])

    if args.api_only:
        print("PASS: backend health/readiness, pagination, validation, 404, archive and person relations")
        return

    for path in ("/", "/about", "/midis"):
        assert "<html" in request(args.frontend, path)
    page = html.unescape(request(args.frontend, "/midis/example-midi"))
    assert detail["entry"]["title"] in page, "Detail must render backend data"
    person_page = html.unescape(request(args.frontend, "/people/" + credit["person_id"]))
    assert credit["display_name"] in person_page, "Person must render backend data"
    request(args.frontend, "/midis/no-such-archive", 404)
    print("PASS: health, database readiness, API pagination/validation/404/detail/person, frontend rendering")


if __name__ == "__main__":
    main()
