"""Tests for admin roadmap export payloads and permissions."""
import io
import json
import os
import uuid
import zipfile

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"
REQUEST_TIMEOUT_SECONDS = float(os.environ.get("TEST_REQUEST_TIMEOUT_SECONDS", "12"))

ADMIN = {
    "email": os.environ.get("ADMIN_EMAIL", "admin@example.com"),
    "password": os.environ.get("ADMIN_PASSWORD", "admin123"),
}
EDITOR = {
    "email": os.environ.get("SEED_EDITOR_EMAIL", "editor@example.com"),
    "password": os.environ.get("SEED_EDITOR_PASSWORD", "editor123"),
}
USER = {
    "email": os.environ.get("SEED_USER_EMAIL", "user@example.com"),
    "password": os.environ.get("SEED_USER_PASSWORD", "user123"),
}


def _login(creds):
    session = requests.Session()
    response = session.post(f"{API}/auth/login", json=creds, timeout=REQUEST_TIMEOUT_SECONDS)
    assert response.status_code == 200, response.text
    return session


def _csrf_headers(session):
    return {"X-CSRF-Token": session.cookies.get("csrf_token")}


def _create_roadmap(session, slug, status):
    response = session.post(
        f"{API}/roadmaps",
        json={
            "slug": slug,
            "title": f"Export {slug}",
            "description": "export test",
            "cover_emoji": "🧪",
            "status": status,
            "tags": "export,test",
            "level": "mixed",
        },
        headers=_csrf_headers(session),
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    assert response.status_code == 201, response.text
    return response.json()


def _delete_roadmap(session, roadmap_id):
    response = session.delete(
        f"{API}/roadmaps/{roadmap_id}",
        headers=_csrf_headers(session),
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    assert response.status_code == 204, response.text


def _published_roadmap_id(slug):
    roadmaps = requests.get(f"{API}/roadmaps", timeout=REQUEST_TIMEOUT_SECONDS).json()
    match = next((entry for entry in roadmaps if entry["slug"] == slug), None)
    assert match is not None, f"missing published roadmap {slug}"
    return match["id"]


def _assert_absent_keys(payload, forbidden_keys):
    if isinstance(payload, dict):
        for key, value in payload.items():
            assert key not in forbidden_keys, f"unexpected key {key} in export payload"
            _assert_absent_keys(value, forbidden_keys)
    elif isinstance(payload, list):
        for item in payload:
            _assert_absent_keys(item, forbidden_keys)


class TestAdminRoadmapExport:
    def test_editor_can_export_single_roadmap_without_db_ids(self):
        session = _login(EDITOR)
        roadmap_id = _published_roadmap_id("frontend")

        response = session.post(
            f"{API}/admin/roadmaps/export",
            json={"roadmap_ids": [roadmap_id]},
            headers=_csrf_headers(session),
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        assert response.status_code == 200, response.text
        assert response.headers["content-type"].startswith("application/json")
        assert "filename=" in response.headers["content-disposition"]

        payload = response.json()
        assert payload["format"] == "open-roadmap-export"
        assert payload["version"] == 1
        assert payload["roadmap"]["slug"] == "frontend"
        assert payload["roadmap"]["blocks"], "expected seeded roadmap blocks"
        assert payload["roadmap"]["links"], "expected seeded roadmap links"
        first_block = payload["roadmap"]["blocks"][0]
        assert first_block["ref"].startswith("block-")
        assert "id" not in first_block
        first_link = payload["roadmap"]["links"][0]
        assert first_link["from_ref"].startswith("block-")
        assert first_link["to_ref"].startswith("block-")
        _assert_absent_keys(payload, {"id", "roadmap_id", "block_id", "from_block_id", "to_block_id"})

    def test_editor_can_export_draft_and_archived_roadmaps_in_zip(self):
        editor = _login(EDITOR)
        admin = _login(ADMIN)
        draft = _create_roadmap(editor, f"export-draft-{uuid.uuid4().hex[:8]}", "draft")
        archived = _create_roadmap(editor, f"export-arch-{uuid.uuid4().hex[:8]}", "archived")

        try:
            response = editor.post(
                f"{API}/admin/roadmaps/export",
                json={"roadmap_ids": [draft["id"], archived["id"]]},
                headers=_csrf_headers(editor),
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
            assert response.status_code == 200, response.text
            assert response.headers["content-type"].startswith("application/zip")

            archive = zipfile.ZipFile(io.BytesIO(response.content))
            names = sorted(archive.namelist())
            assert "manifest.json" in names
            assert f"roadmaps/{draft['slug']}.json" in names
            assert f"roadmaps/{archived['slug']}.json" in names

            manifest = json.loads(archive.read("manifest.json"))
            _assert_absent_keys(manifest, {"id", "roadmap_id", "block_id", "from_block_id", "to_block_id"})
            assert [item["slug"] for item in manifest["roadmaps"]] == [draft["slug"], archived["slug"]]

            draft_payload = json.loads(archive.read(f"roadmaps/{draft['slug']}.json"))
            archived_payload = json.loads(archive.read(f"roadmaps/{archived['slug']}.json"))
            assert draft_payload["roadmap"]["status"] == "draft"
            assert archived_payload["roadmap"]["status"] == "archived"
            _assert_absent_keys(draft_payload, {"id", "roadmap_id", "block_id", "from_block_id", "to_block_id"})
            _assert_absent_keys(archived_payload, {"id", "roadmap_id", "block_id", "from_block_id", "to_block_id"})
        finally:
            _delete_roadmap(admin, draft["id"])
            _delete_roadmap(admin, archived["id"])

    def test_export_rejects_empty_selection(self):
        session = _login(EDITOR)
        response = session.post(
            f"{API}/admin/roadmaps/export",
            json={"roadmap_ids": []},
            headers=_csrf_headers(session),
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        assert response.status_code == 400, response.text

    def test_export_rejects_missing_roadmap(self):
        session = _login(EDITOR)
        response = session.post(
            f"{API}/admin/roadmaps/export",
            json={"roadmap_ids": ["missing-roadmap-id"]},
            headers=_csrf_headers(session),
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        assert response.status_code == 404, response.text

    def test_export_deduplicates_ids_preserving_json_response(self):
        session = _login(EDITOR)
        roadmap_id = _published_roadmap_id("frontend")
        response = session.post(
            f"{API}/admin/roadmaps/export",
            json={"roadmap_ids": [roadmap_id, roadmap_id]},
            headers=_csrf_headers(session),
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        assert response.status_code == 200, response.text
        assert response.headers["content-type"].startswith("application/json")
        payload = response.json()
        assert payload["roadmap"]["slug"] == "frontend"

    def test_user_cannot_export(self):
        session = _login(USER)
        roadmap_id = _published_roadmap_id("frontend")
        response = session.post(
            f"{API}/admin/roadmaps/export",
            json={"roadmap_ids": [roadmap_id]},
            headers=_csrf_headers(session),
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        assert response.status_code == 403, response.text


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
