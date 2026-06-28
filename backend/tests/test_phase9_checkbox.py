"""Phase 9 backend tests for checkbox canvas blocks."""
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


class TestCheckboxCreateAndUpdate:
    def test_create_checkbox_defaults_and_custom_fields(self):
        session = _login(EDITOR)
        roadmap_id, _ = _frontend_id(session)
        created_ids = []
        try:
            default_title = f"TEST_checkbox_default_{uuid.uuid4().hex[:8]}"
            default_response = session.post(
                f"{API}/roadmaps/{roadmap_id}/blocks",
                json={"title": default_title, "kind": "checkbox"},
                headers=_csrf_headers(session),
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
            assert default_response.status_code == 201, default_response.text
            default_body = default_response.json()
            created_ids.append(default_body["id"])
            assert default_body["kind"] == "checkbox"
            assert default_body["width"] == 220
            assert default_body["height"] == 44
            assert default_body["checkbox_color"] == "#111827"
            assert default_body["text_color"] == "#0f172a"
            assert default_body["font_size"] == "base"
            assert default_body["label_side"] == "right"

            custom_title = f"TEST_checkbox_custom_{uuid.uuid4().hex[:8]}"
            custom_response = session.post(
                f"{API}/roadmaps/{roadmap_id}/blocks",
                json={
                    "title": custom_title,
                    "kind": "checkbox",
                    "checkbox_color": "#ef4444",
                    "text_color": "#1d4ed8",
                    "font_size": "xl",
                    "label_side": "left",
                    "width": 320,
                    "height": 68,
                    "x": 640,
                    "y": 512,
                },
                headers=_csrf_headers(session),
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
            assert custom_response.status_code == 201, custom_response.text
            custom_body = custom_response.json()
            created_ids.append(custom_body["id"])
            assert custom_body["kind"] == "checkbox"
            assert custom_body["checkbox_color"] == "#ef4444"
            assert custom_body["text_color"] == "#1d4ed8"
            assert custom_body["font_size"] == "xl"
            assert custom_body["label_side"] == "left"
            assert custom_body["width"] == 320
            assert custom_body["height"] == 68
        finally:
            for block_id in created_ids:
                session.delete(f"{API}/blocks/{block_id}", headers=_csrf_headers(session), timeout=REQUEST_TIMEOUT_SECONDS)

    def test_put_updates_checkbox_fields(self):
        session = _login(EDITOR)
        roadmap_id, _ = _frontend_id(session)
        created_ids = []
        try:
            create_response = session.post(
                f"{API}/roadmaps/{roadmap_id}/blocks",
                json={"title": "TEST_checkbox_put", "kind": "checkbox"},
                headers=_csrf_headers(session),
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
            assert create_response.status_code == 201, create_response.text
            block_id = create_response.json()["id"]
            created_ids.append(block_id)

            update_response = session.put(
                f"{API}/blocks/{block_id}",
                json={
                    "title": "TEST_checkbox_put_updated",
                    "kind": "checkbox",
                    "checkbox_color": "#10b981",
                    "text_color": "#7c3aed",
                    "font_size": "lg",
                    "label_side": "left",
                    "x": 120,
                    "y": 144,
                    "width": 360,
                    "height": 72,
                },
                headers=_csrf_headers(session),
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
            assert update_response.status_code == 200, update_response.text
            body = update_response.json()
            assert body["title"] == "TEST_checkbox_put_updated"
            assert body["checkbox_color"] == "#10b981"
            assert body["text_color"] == "#7c3aed"
            assert body["font_size"] == "lg"
            assert body["label_side"] == "left"
            assert body["width"] == 360
            assert body["height"] == 72

            detail = session.get(f"{API}/roadmaps/frontend", timeout=REQUEST_TIMEOUT_SECONDS).json()
            persisted = next(block for block in detail["blocks"] if block["id"] == block_id)
            assert persisted["checkbox_color"] == "#10b981"
            assert persisted["text_color"] == "#7c3aed"
            assert persisted["font_size"] == "lg"
            assert persisted["label_side"] == "left"
        finally:
            for block_id in created_ids:
                session.delete(f"{API}/blocks/{block_id}", headers=_csrf_headers(session), timeout=REQUEST_TIMEOUT_SECONDS)


class TestCheckboxProgressAndLinks:
    def test_checkbox_progress_counts_and_rejects_in_progress(self):
        editor = _login(EDITOR)
        user = _login(USER)
        roadmap_id, _ = _frontend_id(editor)
        created_ids = []
        try:
            before_response = user.get(f"{API}/progress/me/{roadmap_id}", timeout=REQUEST_TIMEOUT_SECONDS)
            assert before_response.status_code == 200, before_response.text
            before = before_response.json()

            create_response = editor.post(
                f"{API}/roadmaps/{roadmap_id}/blocks",
                json={"title": f"TEST_checkbox_progress_{uuid.uuid4().hex[:8]}", "kind": "checkbox"},
                headers=_csrf_headers(editor),
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
            assert create_response.status_code == 201, create_response.text
            block_id = create_response.json()["id"]
            created_ids.append(block_id)

            complete_response = user.post(
                f"{API}/progress",
                json={"roadmap_id": roadmap_id, "block_id": block_id, "status": "completed"},
                headers=_csrf_headers(user),
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
            assert complete_response.status_code == 200, complete_response.text
            assert complete_response.json()["status"] == "completed"

            after_response = user.get(f"{API}/progress/me/{roadmap_id}", timeout=REQUEST_TIMEOUT_SECONDS)
            assert after_response.status_code == 200, after_response.text
            after = after_response.json()
            assert after["total_blocks"] == before["total_blocks"] + 1
            assert after["completed_blocks"] == before["completed_blocks"] + 1

            invalid_response = user.post(
                f"{API}/progress",
                json={"roadmap_id": roadmap_id, "block_id": block_id, "status": "in_progress"},
                headers=_csrf_headers(user),
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
            assert invalid_response.status_code == 400, invalid_response.text
        finally:
            for block_id in created_ids:
                editor.delete(f"{API}/blocks/{block_id}", headers=_csrf_headers(editor), timeout=REQUEST_TIMEOUT_SECONDS)

    def test_checkbox_links_are_rejected(self):
        session = _login(EDITOR)
        roadmap_id, _ = _frontend_id(session)
        created_ids = []
        try:
            block_response = session.post(
                f"{API}/roadmaps/{roadmap_id}/blocks",
                json={"title": f"TEST_link_block_{uuid.uuid4().hex[:8]}"},
                headers=_csrf_headers(session),
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
            checkbox_response = session.post(
                f"{API}/roadmaps/{roadmap_id}/blocks",
                json={"title": f"TEST_link_checkbox_{uuid.uuid4().hex[:8]}", "kind": "checkbox"},
                headers=_csrf_headers(session),
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
            assert block_response.status_code == 201, block_response.text
            assert checkbox_response.status_code == 201, checkbox_response.text
            block_id = block_response.json()["id"]
            checkbox_id = checkbox_response.json()["id"]
            created_ids.extend([block_id, checkbox_id])

            to_checkbox = session.post(
                f"{API}/roadmaps/{roadmap_id}/links",
                json={"from_block_id": block_id, "to_block_id": checkbox_id, "style": "solid"},
                headers=_csrf_headers(session),
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
            assert to_checkbox.status_code == 400, to_checkbox.text

            from_checkbox = session.post(
                f"{API}/roadmaps/{roadmap_id}/links",
                json={"from_block_id": checkbox_id, "to_block_id": block_id, "style": "solid"},
                headers=_csrf_headers(session),
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
            assert from_checkbox.status_code == 400, from_checkbox.text
        finally:
            for block_id in created_ids:
                session.delete(f"{API}/blocks/{block_id}", headers=_csrf_headers(session), timeout=REQUEST_TIMEOUT_SECONDS)


class TestCheckboxExportImport:
    def test_export_and_import_preserve_checkbox_fields(self):
        editor = _login(EDITOR)
        admin = _login(ADMIN)
        roadmap_id, _ = _frontend_id(editor)
        created_block_ids = []
        imported_roadmap_ids = []
        try:
            title = f"TEST_checkbox_export_{uuid.uuid4().hex[:8]}"
            create_response = editor.post(
                f"{API}/roadmaps/{roadmap_id}/blocks",
                json={
                    "title": title,
                    "kind": "checkbox",
                    "checkbox_color": "#0ea5e9",
                    "text_color": "#f97316",
                    "font_size": "sm",
                    "label_side": "left",
                    "width": 340,
                    "height": 60,
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
            exported_block = next(block for block in exported["roadmap"]["blocks"] if block["title"] == title)
            assert exported_block["kind"] == "checkbox"
            assert exported_block["checkbox_color"] == "#0ea5e9"
            assert exported_block["text_color"] == "#f97316"
            assert exported_block["font_size"] == "sm"
            assert exported_block["label_side"] == "left"

            import_response = admin.post(
                f"{API}/admin/roadmaps/import",
                files={"file": ("checkbox-roadmap.json", json.dumps(exported).encode("utf-8"), "application/json")},
                headers=_csrf_headers(admin),
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
            assert import_response.status_code == 200, import_response.text
            imported = import_response.json()
            assert imported["imported_count"] == 1
            imported_slug = imported["roadmaps"][0]["slug_final"]

            imported_detail_response = admin.get(
                f"{API}/admin/roadmaps/detail/{imported_slug}",
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
            assert imported_detail_response.status_code == 200, imported_detail_response.text
            imported_detail = imported_detail_response.json()
            imported_roadmap_ids.append(imported_detail["id"])
            imported_block = next(block for block in imported_detail["blocks"] if block["title"] == title)
            assert imported_block["kind"] == "checkbox"
            assert imported_block["checkbox_color"] == "#0ea5e9"
            assert imported_block["text_color"] == "#f97316"
            assert imported_block["font_size"] == "sm"
            assert imported_block["label_side"] == "left"
        finally:
            for block_id in created_block_ids:
                editor.delete(f"{API}/blocks/{block_id}", headers=_csrf_headers(editor), timeout=REQUEST_TIMEOUT_SECONDS)
            for roadmap_id in imported_roadmap_ids:
                admin.delete(f"{API}/roadmaps/{roadmap_id}", headers=_csrf_headers(admin), timeout=REQUEST_TIMEOUT_SECONDS)
