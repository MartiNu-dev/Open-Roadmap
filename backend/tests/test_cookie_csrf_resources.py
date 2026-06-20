"""Backend tests for cookie+CSRF auth migration and resources CRUD (iteration 4)."""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://learning-blocks-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@example.com", "password": "admin123"}
EDITOR = {"email": "editor@example.com", "password": "editor123"}
USER = {"email": "user@example.com", "password": "user123"}


def _login(creds):
    s = requests.Session()
    r = s.post(f"{API}/auth/login", json=creds)
    assert r.status_code == 200, r.text
    return s, r


# ---------- AUTH / COOKIE ----------
class TestCookieAuth:
    def test_login_sets_cookies(self):
        s, r = _login(ADMIN)
        cookies = s.cookies.get_dict()
        assert "access_token" in cookies, f"missing access_token cookie: {cookies}"
        assert "csrf_token" in cookies, f"missing csrf_token cookie: {cookies}"
        body = r.json()
        assert "access_token" in body and body["user"]["email"] == ADMIN["email"]
        # access_token cookie should be HttpOnly. requests doesn't expose HttpOnly directly;
        # check via Set-Cookie header
        set_cookies = r.headers.get_all("set-cookie") if hasattr(r.headers, "get_all") else r.raw.headers.getlist("Set-Cookie")
        joined = "\n".join(set_cookies)
        assert "access_token=" in joined and "HttpOnly" in joined, joined
        assert "csrf_token=" in joined

    def test_me_with_cookie_only(self):
        s, _ = _login(USER)
        r = s.get(f"{API}/auth/me")
        assert r.status_code == 200
        assert r.json()["email"] == USER["email"]

    def test_me_no_auth_returns_401(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_bearer_backcompat(self):
        # Login then use access_token from JSON body as Bearer (no cookies)
        r = requests.post(f"{API}/auth/login", json=ADMIN)
        token = r.json()["access_token"]
        r2 = requests.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r2.status_code == 200
        assert r2.json()["role"] == "admin"

    def test_logout_clears_cookie(self):
        s, _ = _login(USER)
        # logout is POST -> requires CSRF when using cookie
        csrf = s.cookies.get("csrf_token")
        r = s.post(f"{API}/auth/logout", headers={"X-CSRF-Token": csrf})
        assert r.status_code == 200
        # After logout, /auth/me should be 401 (cookies cleared by server)
        r2 = s.get(f"{API}/auth/me")
        assert r2.status_code == 401


# ---------- CSRF ----------
class TestCsrf:
    def test_post_without_csrf_header_blocked(self):
        s, _ = _login(EDITOR)
        # Don't send X-CSRF-Token: should 403
        r = s.post(f"{API}/auth/logout")
        assert r.status_code == 403, r.text

    def test_post_with_matching_csrf_ok(self):
        s, _ = _login(EDITOR)
        csrf = s.cookies.get("csrf_token")
        r = s.post(f"{API}/auth/logout", headers={"X-CSRF-Token": csrf})
        assert r.status_code == 200

    def test_csrf_exempt_login(self):
        # login itself must not require CSRF (no header) — confirmed by _login above
        s, r = _login(ADMIN)
        assert r.status_code == 200

    def test_csrf_exempt_register_path(self):
        # We don't actually create a user (would dirty DB); just confirm path is exempt by sending bad body
        r = requests.post(f"{API}/auth/register", json={"email": "bad"})
        # Validation error 422 = CSRF allowed through (not 403)
        assert r.status_code in (400, 409, 422), r.status_code

    def test_bearer_bypasses_csrf(self):
        # Bearer auth path should skip CSRF entirely
        r = requests.post(f"{API}/auth/login", json=ADMIN)
        token = r.json()["access_token"]
        # Make a POST with Bearer and no CSRF header -> should not 403
        r2 = requests.post(
            f"{API}/auth/logout",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r2.status_code == 200, r2.text


# ---------- RESOURCES CRUD ----------
def _get_first_block_id(session):
    r = session.get(f"{API}/roadmaps/frontend")
    assert r.status_code == 200
    data = r.json()
    assert data["blocks"], "No blocks in frontend roadmap"
    return data["blocks"][0]["id"], data["blocks"][0].get("resources", [])


class TestResourcesCRUD:
    created_id = None

    def test_get_roadmap_embeds_resources(self):
        s = requests.Session()
        r = s.get(f"{API}/roadmaps/frontend")
        assert r.status_code == 200
        data = r.json()
        b0 = data["blocks"][0]
        assert "resources" in b0
        assert isinstance(b0["resources"], list)
        if b0["resources"]:
            res = b0["resources"][0]
            for k in ("id", "label", "url", "kind", "order_index"):
                assert k in res

    def test_anonymous_create_resource_401(self):
        s = requests.Session()
        block_id, _ = _get_first_block_id(s)
        r = s.post(f"{API}/blocks/{block_id}/resources", json={"label": "X", "url": "https://x", "kind": "article"})
        assert r.status_code == 401

    def test_user_create_resource_403(self):
        s, _ = _login(USER)
        csrf = s.cookies.get("csrf_token")
        block_id, _ = _get_first_block_id(s)
        r = s.post(
            f"{API}/blocks/{block_id}/resources",
            json={"label": "X", "url": "https://x", "kind": "article"},
            headers={"X-CSRF-Token": csrf},
        )
        assert r.status_code == 403

    def test_editor_full_crud(self):
        s, _ = _login(EDITOR)
        csrf = s.cookies.get("csrf_token")
        headers = {"X-CSRF-Token": csrf}
        block_id, before = _get_first_block_id(s)

        # CREATE
        payload = {"label": "TEST_doc", "url": "https://example.com/doc", "kind": "article"}
        r = s.post(f"{API}/blocks/{block_id}/resources", json=payload, headers=headers)
        assert r.status_code == 201, r.text
        created = r.json()
        assert created["label"] == "TEST_doc"
        assert created["url"] == "https://example.com/doc"
        assert created["kind"] == "article"
        assert "id" in created and "order_index" in created
        rid = created["id"]

        # Verify embedded in roadmap
        r2 = s.get(f"{API}/roadmaps/frontend")
        block_resources = next(b for b in r2.json()["blocks"] if b["id"] == block_id)["resources"]
        assert any(x["id"] == rid for x in block_resources), "Newly created resource not embedded"

        # PATCH
        upd = {"label": "TEST_doc_updated", "kind": "video", "url": "https://example.com/v", "order_index": 99}
        r3 = s.patch(f"{API}/resources/{rid}", json=upd, headers=headers)
        assert r3.status_code == 200, r3.text
        out = r3.json()
        assert out["label"] == "TEST_doc_updated"
        assert out["kind"] == "video"
        assert out["url"] == "https://example.com/v"
        assert out["order_index"] == 99

        # GET-confirm via roadmap embed
        r4 = s.get(f"{API}/roadmaps/frontend")
        br = next(b for b in r4.json()["blocks"] if b["id"] == block_id)["resources"]
        found = next(x for x in br if x["id"] == rid)
        assert found["label"] == "TEST_doc_updated"

        # DELETE without csrf -> 403
        r5 = s.delete(f"{API}/resources/{rid}")
        assert r5.status_code == 403

        # DELETE with csrf -> 204
        r6 = s.delete(f"{API}/resources/{rid}", headers=headers)
        assert r6.status_code == 204

        # Verify removed
        r7 = s.get(f"{API}/roadmaps/frontend")
        br2 = next(b for b in r7.json()["blocks"] if b["id"] == block_id)["resources"]
        assert not any(x["id"] == rid for x in br2), "Resource still present after delete"


# ---------- BACKWARDS-COMPAT existing endpoints ----------
class TestExistingViaCookie:
    def test_list_roadmaps_public(self):
        r = requests.get(f"{API}/roadmaps")
        assert r.status_code == 200
        assert any(rm["slug"] == "frontend" for rm in r.json())

    def test_progress_upsert_via_cookie(self):
        s, _ = _login(USER)
        csrf = s.cookies.get("csrf_token")
        rd = s.get(f"{API}/roadmaps/frontend").json()
        block = rd["blocks"][0]
        payload = {"roadmap_id": rd["id"], "block_id": block["id"], "status": "in_progress", "notes": "TEST_note"}
        r = s.post(f"{API}/progress", json=payload, headers={"X-CSRF-Token": csrf})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "in_progress"

    def test_admin_list_users_via_cookie(self):
        s, _ = _login(ADMIN)
        r = s.get(f"{API}/admin/users")
        assert r.status_code == 200
        emails = {u["email"] for u in r.json()}
        assert {"admin@example.com", "editor@example.com", "user@example.com"} <= emails


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
