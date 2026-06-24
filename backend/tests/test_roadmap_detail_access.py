"""Tests for roadmap detail access across published and non-published statuses."""
import os
import socket
import subprocess
import tempfile
import time
import uuid
from pathlib import Path

import pytest
import requests

ROOT_DIR = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT_DIR / "backend"
VENV_PYTHON = ROOT_DIR / ".venv" / "Scripts" / "python.exe"
TEMP_DB_DIR = Path(tempfile.gettempdir()) / "open-roadmap-tests"
TEMP_DB_DIR.mkdir(parents=True, exist_ok=True)

ADMIN = {"email": "admin@example.com", "password": "admin123"}
EDITOR = {"email": "editor@example.com", "password": "editor123"}
USER = {"email": "user@example.com", "password": "user123"}


def _find_free_port():
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


@pytest.fixture(scope="module")
def api_base():
    port = _find_free_port()
    env = os.environ.copy()
    env["SQLITE_PATH"] = str(TEMP_DB_DIR / f"roadmap-detail-access-{port}.db")
    env["JWT_SECRET"] = "test-secret-for-roadmap-detail-access"
    env["ADMIN_EMAIL"] = ADMIN["email"]
    env["ADMIN_PASSWORD"] = ADMIN["password"]
    env["SEED_USER_EMAIL"] = USER["email"]
    env["SEED_USER_PASSWORD"] = USER["password"]
    env["SEED_EDITOR_EMAIL"] = EDITOR["email"]
    env["SEED_EDITOR_PASSWORD"] = EDITOR["password"]

    process = subprocess.Popen(
        [
            str(VENV_PYTHON),
            "-m",
            "uvicorn",
            "server:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
        ],
        cwd=str(BACKEND_DIR),
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    base_url = f"http://127.0.0.1:{port}/api"
    try:
        for _ in range(60):
            try:
                response = requests.get(f"http://127.0.0.1:{port}/", timeout=1)
                if response.status_code == 200:
                    break
            except requests.RequestException:
                pass
            time.sleep(0.25)
        else:
            raise RuntimeError("Timed out waiting for local backend test server to start")

        yield base_url
    finally:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=10)


def _login(session, api_base, creds):
    response = session.post(f"{api_base}/auth/login", json=creds, timeout=12)
    assert response.status_code == 200, response.text


def _csrf_headers(session):
    return {"X-CSRF-Token": session.cookies.get("csrf_token")}


def _create_roadmap(session, api_base, slug, status, tags="detail,test"):
    response = session.post(
        f"{api_base}/roadmaps",
        json={
            "slug": slug,
            "title": f"Detail {slug}",
            "description": "detail access test",
            "cover_emoji": "T",
            "status": status,
            "tags": tags,
            "level": "mixed",
        },
        headers=_csrf_headers(session),
        timeout=12,
    )
    assert response.status_code == 201, response.text
    return response.json()


def _delete_roadmap(session, api_base, roadmap_id):
    response = session.delete(
        f"{api_base}/roadmaps/{roadmap_id}",
        headers=_csrf_headers(session),
        timeout=12,
    )
    assert response.status_code == 204, response.text


class TestRoadmapDetailAccess:
    def test_editor_can_read_draft_roadmap_detail(self, api_base):
        editor = requests.Session()
        admin = requests.Session()
        _login(editor, api_base, EDITOR)
        _login(admin, api_base, ADMIN)
        roadmap = _create_roadmap(editor, api_base, f"detail-draft-{uuid.uuid4().hex[:8]}", "draft")

        try:
            response = editor.get(f"{api_base}/roadmaps/{roadmap['slug']}", timeout=12)
            assert response.status_code == 200, response.text
            payload = response.json()
            assert payload["id"] == roadmap["id"]
            assert payload["status"] == "draft"
        finally:
            _delete_roadmap(admin, api_base, roadmap["id"])

    def test_admin_can_read_archived_roadmap_detail(self, api_base):
        editor = requests.Session()
        admin = requests.Session()
        _login(editor, api_base, EDITOR)
        _login(admin, api_base, ADMIN)
        roadmap = _create_roadmap(editor, api_base, f"detail-archived-{uuid.uuid4().hex[:8]}", "archived")

        try:
            response = admin.get(f"{api_base}/roadmaps/{roadmap['slug']}", timeout=12)
            assert response.status_code == 200, response.text
            payload = response.json()
            assert payload["id"] == roadmap["id"]
            assert payload["status"] == "archived"
        finally:
            _delete_roadmap(admin, api_base, roadmap["id"])

    def test_regular_user_gets_404_for_non_published_roadmap(self, api_base):
        editor = requests.Session()
        admin = requests.Session()
        user = requests.Session()
        _login(editor, api_base, EDITOR)
        _login(admin, api_base, ADMIN)
        _login(user, api_base, USER)
        roadmap = _create_roadmap(editor, api_base, f"detail-private-{uuid.uuid4().hex[:8]}", "draft")

        try:
            response = user.get(f"{api_base}/roadmaps/{roadmap['slug']}", timeout=12)
            assert response.status_code == 404, response.text
        finally:
            _delete_roadmap(admin, api_base, roadmap["id"])

    def test_anonymous_user_gets_404_for_non_published_roadmap(self, api_base):
        editor = requests.Session()
        admin = requests.Session()
        _login(editor, api_base, EDITOR)
        _login(admin, api_base, ADMIN)
        roadmap = _create_roadmap(editor, api_base, f"detail-anon-{uuid.uuid4().hex[:8]}", "draft")

        try:
            response = requests.get(f"{api_base}/roadmaps/{roadmap['slug']}", timeout=12)
            assert response.status_code == 404, response.text
        finally:
            _delete_roadmap(admin, api_base, roadmap["id"])

    def test_published_roadmap_remains_public(self, api_base):
        editor = requests.Session()
        admin = requests.Session()
        _login(editor, api_base, EDITOR)
        _login(admin, api_base, ADMIN)
        roadmap = _create_roadmap(editor, api_base, f"detail-public-{uuid.uuid4().hex[:8]}", "published", tags="public,detail,test")

        try:
            response = requests.get(f"{api_base}/roadmaps/{roadmap['slug']}", timeout=12)
            assert response.status_code == 200, response.text
            payload = response.json()
            assert payload["id"] == roadmap["id"]
            assert payload["status"] == "published"
        finally:
            _delete_roadmap(admin, api_base, roadmap["id"])


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
