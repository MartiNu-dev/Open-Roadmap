"""Phase 10 backend tests for free-text canvas blocks."""
import json
import os
import uuid

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


def _frontend_id(session=None):
    sess = session or requests
    response = sess.get(f"{API}/roadmaps/frontend", timeout=REQUEST_TIMEOUT_SECONDS)
    assert response.status_code == 200, response.text
    payload = response.json()
    return payload["id"], payload


class TestTextCreateAndUpdate:
    def test_create_and_update_text_block_fields(self):
        session = _login(EDITOR)
        roadmap_id, _ = _frontend_id(session)
        created_ids = []
        try:
            title = f"Heading line {uuid.uuid4().hex[:6]}\nSecond line"
            create_response = session.post(
                f"{API}/roadmaps/{roadmap_id}/blocks",
                json={
                    "title": title,
                    "kind": "text",
                    "label_align": "justify",
                    "text_color": "#2563eb",
                    "font_size": "custom",
                    "font_size_px": 28,
                    "width": 360,
                    "height": 96,
                },
                headers=_csrf_headers(session),
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
            assert create_response.status_code == 201, create_response.text
            body = create_response.json()
            created_ids.append(body["id"])
            assert body["kind"] == "text"
            assert body["title"] == title
            assert body["label_align"] == "justify"
            assert body["text_color"] == "#2563eb"
            assert body["font_size"] == "custom"
            assert body["font_size_px"] == 28

            update_response = session.put(
                f"{API}/blocks/{body['id']}",
                json={
                    "title": f"{title}\nThird line",
                    "kind": "text",
                    "label_align": "center",
                    "text_color": "#7c3aed",
                    "font_size": "lg",
                    "font_size_px": 44,
                    "x": 240,
                    "y": 180,
                    "width": 280,
                    "height": 88,
                },
                headers=_csrf_headers(session),
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
            assert update_response.status_code == 200, update_response.text
            updated = update_response.json()
            assert updated["label_align"] == "center"
            assert updated["text_color"] == "#7c3aed"
            assert updated["font_size"] == "lg"
            assert updated["font_size_px"] is None

            detail = session.get(f"{API}/roadmaps/frontend", timeout=REQUEST_TIMEOUT_SECONDS).json()
            persisted = next(block for block in detail["blocks"] if block["id"] == body["id"])
            assert persisted["kind"] == "text"
            assert persisted["font_size"] == "lg"
            assert persisted["font_size_px"] is None
        finally:
            for block_id in created_ids:
                session.delete(f"{API}/blocks/{block_id}", headers=_csrf_headers(session), timeout=REQUEST_TIMEOUT_SECONDS)


class TestTextProgressAndLinks:
    def test_text_progress_is_rejected(self):
        editor = _login(EDITOR)
        user = _login(USER)
        roadmap_id, _ = _frontend_id(editor)
        created_ids = []
        try:
            create_response = editor.post(
                f"{API}/roadmaps/{roadmap_id}/blocks",
                json={"title": f"Decorative text {uuid.uuid4().hex[:8]}", "kind": "text"},
                headers=_csrf_headers(editor),
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
            assert create_response.status_code == 201, create_response.text
            block_id = create_response.json()["id"]
            created_ids.append(block_id)

            progress_response = user.post(
                f"{API}/progress",
                json={"roadmap_id": roadmap_id, "block_id": block_id, "status": "completed"},
                headers=_csrf_headers(user),
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
            assert progress_response.status_code == 400, progress_response.text
        finally:
            for block_id in created_ids:
                editor.delete(f"{API}/blocks/{block_id}", headers=_csrf_headers(editor), timeout=REQUEST_TIMEOUT_SECONDS)

    def test_text_links_are_rejected(self):
        session = _login(EDITOR)
        roadmap_id, _ = _frontend_id(session)
        created_ids = []
        try:
            block_response = session.post(
                f"{API}/roadmaps/{roadmap_id}/blocks",
                json={"title": f"Block {uuid.uuid4().hex[:8]}"},
                headers=_csrf_headers(session),
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
            text_response = session.post(
                f"{API}/roadmaps/{roadmap_id}/blocks",
                json={"title": f"Text {uuid.uuid4().hex[:8]}", "kind": "text"},
                headers=_csrf_headers(session),
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
            assert block_response.status_code == 201, block_response.text
            assert text_response.status_code == 201, text_response.text
            block_id = block_response.json()["id"]
            text_id = text_response.json()["id"]
            created_ids.extend([block_id, text_id])

            to_text = session.post(
                f"{API}/roadmaps/{roadmap_id}/links",
                json={"from_block_id": block_id, "to_block_id": text_id, "style": "solid"},
                headers=_csrf_headers(session),
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
            assert to_text.status_code == 400, to_text.text

            from_text = session.post(
                f"{API}/roadmaps/{roadmap_id}/links",
                json={"from_block_id": text_id, "to_block_id": block_id, "style": "solid"},
                headers=_csrf_headers(session),
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
            assert from_text.status_code == 400, from_text.text
        finally:
            for block_id in created_ids:
                session.delete(f"{API}/blocks/{block_id}", headers=_csrf_headers(session), timeout=REQUEST_TIMEOUT_SECONDS)


class TestTextExportImport:
    def test_export_and_import_preserve_text_fields(self):
        editor = _login(EDITOR)
        admin = _login(ADMIN)
        roadmap_id, _ = _frontend_id(editor)
        created_block_ids = []
        imported_roadmap_ids = []
        try:
            title = f"Title {uuid.uuid4().hex[:6]}\nA multiline decorative note"
            create_response = editor.post(
                f"{API}/roadmaps/{roadmap_id}/blocks",
                json={
                    "title": title,
                    "kind": "text",
                    "label_align": "justify",
                    "text_color": "#ea580c",
                    "font_size": "custom",
                    "font_size_px": 26,
                    "width": 340,
                    "height": 92,
                },
                headers=_csrf_headers(editor),
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
            assert create_response.status_code == 201, create_response.text
            created_block_ids.append(create_response.json()["id"])

            export_response = editor.post(
                f"{API}/admin/roadmaps/export",
                json={"roadmap_ids": [roadmap_id]},
                headers=_csrf_headers(editor),
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
            assert export_response.status_code == 200, export_response.text
            exported = export_response.json()
            assert exported["version"] == 4
            exported_block = next(block for block in exported["roadmap"]["blocks"] if block["title"] == title)
            assert exported_block["kind"] == "text"
            assert exported_block["label_align"] == "justify"
            assert exported_block["text_color"] == "#ea580c"
            assert exported_block["font_size"] == "custom"
            assert exported_block["font_size_px"] == 26

            import_response = admin.post(
                f"{API}/admin/roadmaps/import",
                files={"file": ("text-roadmap.json", json.dumps(exported).encode("utf-8"), "application/json")},
                headers=_csrf_headers(admin),
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
            assert import_response.status_code == 200, import_response.text
            imported = import_response.json()
            imported_slug = imported["roadmaps"][0]["slug_final"]

            imported_detail_response = admin.get(
                f"{API}/admin/roadmaps/detail/{imported_slug}",
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
            assert imported_detail_response.status_code == 200, imported_detail_response.text
            imported_detail = imported_detail_response.json()
            imported_roadmap_ids.append(imported_detail["id"])
            imported_block = next(block for block in imported_detail["blocks"] if block["title"] == title)
            assert imported_block["kind"] == "text"
            assert imported_block["label_align"] == "justify"
            assert imported_block["text_color"] == "#ea580c"
            assert imported_block["font_size"] == "custom"
            assert imported_block["font_size_px"] == 26
        finally:
            for block_id in created_block_ids:
                editor.delete(f"{API}/blocks/{block_id}", headers=_csrf_headers(editor), timeout=REQUEST_TIMEOUT_SECONDS)
            for roadmap_id in imported_roadmap_ids:
                admin.delete(f"{API}/roadmaps/{roadmap_id}", headers=_csrf_headers(admin), timeout=REQUEST_TIMEOUT_SECONDS)
