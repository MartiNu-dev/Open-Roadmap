"""Tests for admin roadmap import payloads and permissions."""
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


def _create_roadmap(session, slug, status="draft"):
    response = session.post(
        f"{API}/roadmaps",
        json={
            "slug": slug,
            "title": f"Import {slug}",
            "description": "import test",
            "cover_emoji": "🧪",
            "status": status,
            "tags": "import,test",
            "level": "mixed",
        },
        headers=_csrf_headers(session),
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    assert response.status_code == 201, response.text
    return response.json()


def _roadmap_export(session, roadmap_ids):
    response = session.post(
        f"{API}/admin/roadmaps/export",
        json={"roadmap_ids": roadmap_ids},
        headers=_csrf_headers(session),
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    assert response.status_code == 200, response.text
    return response


def _admin_roadmaps(session):
    response = session.get(f"{API}/admin/roadmaps", timeout=REQUEST_TIMEOUT_SECONDS)
    assert response.status_code == 200, response.text
    return response.json()


def _delete_by_slug(admin_session, slug):
    matches = [entry for entry in _admin_roadmaps(admin_session) if entry["slug"] == slug]
    for entry in matches:
        response = admin_session.delete(
            f"{API}/roadmaps/{entry['id']}",
            headers=_csrf_headers(admin_session),
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
        assert response.status_code == 204, response.text


def _import_file(session, file_name, file_bytes, content_type):
    response = session.post(
        f"{API}/admin/roadmaps/import",
        files={"file": (file_name, file_bytes, content_type)},
        headers=_csrf_headers(session),
        timeout=REQUEST_TIMEOUT_SECONDS,
    )
    return response


class TestAdminRoadmapImport:
    def test_editor_can_import_valid_json_as_draft(self):
        editor = _login(EDITOR)
        admin = _login(ADMIN)
        slug = f"import-json-{uuid.uuid4().hex[:8]}"
        source = _create_roadmap(editor, slug, "published")

        try:
            exported = _roadmap_export(editor, [source["id"]])
            imported = _import_file(editor, f"{slug}.json", exported.content, "application/json")
            assert imported.status_code == 200, imported.text
            body = imported.json()
            assert body["imported_count"] == 1
            created = body["roadmaps"][0]
            assert created["slug_source"] == slug
            assert created["slug_final"].startswith(slug)
            assert created["slug_final"] != slug
            assert created["status"] == "draft"
        finally:
            _delete_by_slug(admin, slug)
            for suffix in range(2, 6):
                _delete_by_slug(admin, f"{slug}-{suffix}")

    def test_editor_can_import_valid_zip_bundle(self):
        editor = _login(EDITOR)
        admin = _login(ADMIN)
        slug_a = f"import-zip-a-{uuid.uuid4().hex[:6]}"
        slug_b = f"import-zip-b-{uuid.uuid4().hex[:6]}"
        created_a = _create_roadmap(editor, slug_a, "draft")
        created_b = _create_roadmap(editor, slug_b, "archived")

        try:
            exported = _roadmap_export(editor, [created_a["id"], created_b["id"]])
            imported = _import_file(editor, "bundle.zip", exported.content, "application/zip")
            assert imported.status_code == 200, imported.text
            body = imported.json()
            assert body["imported_count"] == 2
            finals = {entry["slug_final"] for entry in body["roadmaps"]}
            assert any(slug.startswith(slug_a) and slug != slug_a for slug in finals)
            assert any(slug.startswith(slug_b) and slug != slug_b for slug in finals)
        finally:
            for slug in (slug_a, slug_b):
                _delete_by_slug(admin, slug)
                for suffix in range(2, 6):
                    _delete_by_slug(admin, f"{slug}-{suffix}")

    def test_import_rejects_invalid_link_refs(self):
        session = _login(EDITOR)
        payload = {
            "format": "open-roadmap-export",
            "version": 1,
            "exported_at": "2026-06-24T12:00:00Z",
            "roadmap": {
                "slug": f"invalid-ref-{uuid.uuid4().hex[:8]}",
                "title": "Invalid refs",
                "description": "",
                "status": "published",
                "cover_emoji": "🗺️",
                "tags": "",
                "level": "mixed",
                "blocks": [
                    {
                        "ref": "block-001",
                        "title": "Block A",
                        "short_description": "",
                        "detailed_content": "",
                        "level": "",
                        "estimated_duration": "",
                        "order_index": 1,
                        "x": 0,
                        "y": 0,
                        "width": 220,
                        "height": 44,
                        "node_style": "primary",
                        "kind": "block",
                        "visibility_mode": "visible",
                        "bg_color": "#0f172a",
                        "label_position": "bottom",
                        "label_align": "center",
                        "resources": [],
                    }
                ],
                "links": [
                    {
                        "from_ref": "block-001",
                        "to_ref": "block-999",
                        "style": "solid",
                        "label": "",
                        "color": "#475569",
                        "thickness": "medium",
                        "from_side": "bottom",
                        "to_side": "top",
                    }
                ],
            },
        }
        response = _import_file(session, "invalid.json", json.dumps(payload).encode("utf-8"), "application/json")
        assert response.status_code == 400, response.text

    def test_import_rejects_zip_without_manifest(self):
        session = _login(EDITOR)
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
            archive.writestr("roadmaps/example.json", "{}")
        response = _import_file(session, "broken.zip", buffer.getvalue(), "application/zip")
        assert response.status_code == 400, response.text

    def test_import_rejects_unsupported_version(self):
        session = _login(EDITOR)
        payload = {
            "format": "open-roadmap-export",
            "version": 99,
            "exported_at": "2026-06-24T12:00:00Z",
            "roadmap": {
                "slug": f"unsupported-{uuid.uuid4().hex[:8]}",
                "title": "Unsupported version",
                "description": "",
                "status": "published",
                "cover_emoji": "🗺️",
                "tags": "",
                "level": "mixed",
                "blocks": [
                    {
                        "ref": "block-001",
                        "title": "Block A",
                        "short_description": "",
                        "detailed_content": "",
                        "level": "",
                        "estimated_duration": "",
                        "order_index": 1,
                        "x": 0,
                        "y": 0,
                        "width": 220,
                        "height": 44,
                        "node_style": "primary",
                        "kind": "block",
                        "visibility_mode": "visible",
                        "bg_color": "#0f172a",
                        "label_position": "bottom",
                        "label_align": "center",
                        "resources": [],
                    }
                ],
                "links": [],
            },
        }
        response = _import_file(session, "unsupported.json", json.dumps(payload).encode("utf-8"), "application/json")
        assert response.status_code == 400, response.text

    def test_import_is_atomic_when_one_zip_entry_is_invalid(self):
        editor = _login(EDITOR)
        admin = _login(ADMIN)
        slug = f"atomic-{uuid.uuid4().hex[:8]}"
        source = _create_roadmap(editor, slug, "draft")

        try:
            exported = _roadmap_export(editor, [source["id"]]).json()
            broken = json.loads(json.dumps(exported))
            broken["roadmap"]["links"] = [{
                "from_ref": "block-001",
                "to_ref": "missing-block",
                "style": "solid",
                "label": "",
                "color": "#475569",
                "thickness": "medium",
                "from_side": "bottom",
                "to_side": "top",
            }]

            buffer = io.BytesIO()
            with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
                archive.writestr("manifest.json", json.dumps({
                    "format": "open-roadmap-export",
                    "version": 1,
                    "exported_at": exported["exported_at"],
                    "roadmaps": [
                        {"slug": exported["roadmap"]["slug"], "title": exported["roadmap"]["title"], "status": "draft", "file": "roadmaps/valid.json"},
                        {"slug": "broken-roadmap", "title": "Broken", "status": "draft", "file": "roadmaps/broken.json"},
                    ],
                }).encode("utf-8"))
                archive.writestr("roadmaps/valid.json", json.dumps(exported).encode("utf-8"))
                archive.writestr("roadmaps/broken.json", json.dumps(broken).encode("utf-8"))

            before = len(_admin_roadmaps(editor))
            response = _import_file(editor, "atomic.zip", buffer.getvalue(), "application/zip")
            after = len(_admin_roadmaps(editor))
            assert response.status_code == 400, response.text
            assert before == after
        finally:
            _delete_by_slug(admin, slug)
            for suffix in range(2, 6):
                _delete_by_slug(admin, f"{slug}-{suffix}")

    def test_import_v1_defaults_group_visibility_to_visible(self):
        editor = _login(EDITOR)
        admin = _login(ADMIN)
        slug = f"import-v1-group-{uuid.uuid4().hex[:8]}"
        payload = {
            "format": "open-roadmap-export",
            "version": 1,
            "exported_at": "2026-06-24T12:00:00Z",
            "roadmap": {
                "slug": slug,
                "title": "Legacy group visibility",
                "description": "",
                "status": "published",
                "cover_emoji": "🧪",
                "tags": "",
                "level": "mixed",
                "blocks": [
                    {
                        "ref": "group-001",
                        "title": "",
                        "short_description": "",
                        "detailed_content": "",
                        "level": "",
                        "estimated_duration": "",
                        "order_index": 1,
                        "x": 0,
                        "y": 0,
                        "width": 220,
                        "height": 44,
                        "node_style": "primary",
                        "kind": "group",
                        "bg_color": "#0f172a",
                        "label_position": "bottom",
                        "label_align": "center",
                        "resources": [],
                    }
                ],
                "links": [],
            },
        }

        try:
            response = _import_file(editor, "legacy-group.json", json.dumps(payload).encode("utf-8"), "application/json")
            assert response.status_code == 200, response.text
            created_slug = response.json()["roadmaps"][0]["slug_final"]
            detail = editor.get(f"{API}/admin/roadmaps/detail/{created_slug}", timeout=REQUEST_TIMEOUT_SECONDS)
            assert detail.status_code == 200, detail.text
            block = detail.json()["blocks"][0]
            assert block["kind"] == "group"
            assert block["visibility_mode"] == "visible"
            assert block["title"] == ""
        finally:
            _delete_by_slug(admin, slug)
            for suffix in range(2, 6):
                _delete_by_slug(admin, f"{slug}-{suffix}")

    def test_import_v2_restores_transparent_group_visibility(self):
        editor = _login(EDITOR)
        admin = _login(ADMIN)
        slug = f"import-v2-group-{uuid.uuid4().hex[:8]}"
        payload = {
            "format": "open-roadmap-export",
            "version": 2,
            "exported_at": "2026-06-24T12:00:00Z",
            "roadmap": {
                "slug": slug,
                "title": "Transparent group visibility",
                "description": "",
                "status": "published",
                "cover_emoji": "🧪",
                "tags": "",
                "level": "mixed",
                "blocks": [
                    {
                        "ref": "group-001",
                        "title": "",
                        "short_description": "",
                        "detailed_content": "",
                        "level": "",
                        "estimated_duration": "",
                        "order_index": 1,
                        "x": 0,
                        "y": 0,
                        "width": 220,
                        "height": 44,
                        "node_style": "primary",
                        "kind": "group",
                        "visibility_mode": "transparent",
                        "bg_color": "#0f172a",
                        "label_position": "bottom",
                        "label_align": "center",
                        "resources": [],
                    }
                ],
                "links": [],
            },
        }

        try:
            response = _import_file(editor, "transparent-group.json", json.dumps(payload).encode("utf-8"), "application/json")
            assert response.status_code == 200, response.text
            created_slug = response.json()["roadmaps"][0]["slug_final"]
            detail = editor.get(f"{API}/admin/roadmaps/detail/{created_slug}", timeout=REQUEST_TIMEOUT_SECONDS)
            assert detail.status_code == 200, detail.text
            block = detail.json()["blocks"][0]
            assert block["kind"] == "group"
            assert block["visibility_mode"] == "transparent"
            assert block["title"] == ""
        finally:
            _delete_by_slug(admin, slug)
            for suffix in range(2, 6):
                _delete_by_slug(admin, f"{slug}-{suffix}")

    def test_user_cannot_import(self):
        session = _login(USER)
        response = _import_file(session, "empty.json", b"{}", "application/json")
        assert response.status_code == 403, response.text


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
