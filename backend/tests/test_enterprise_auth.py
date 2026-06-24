"""Backend integration tests for enterprise auth settings and OIDC support."""
from __future__ import annotations

import base64
import json
import os
import socket
import sqlite3
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import jwt
import pytest
import requests
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa

ROOT = Path(__file__).resolve().parents[1]
PROJECT_ROOT = ROOT.parent
PYTHON = PROJECT_ROOT / ".venv" / "Scripts" / "python.exe"
REQUEST_TIMEOUT = 12


class TimeoutSession(requests.Session):
    def request(self, method, url, **kwargs):  # noqa: A003
        kwargs.setdefault("timeout", REQUEST_TIMEOUT)
        return super().request(method, url, **kwargs)


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def _b64_uint(value: int) -> str:
    raw = value.to_bytes((value.bit_length() + 7) // 8, "big")
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def build_rsa_signer():
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    public_key = private_key.public_key().public_numbers()
    jwk = {
        "kty": "RSA",
        "kid": "test-key",
        "use": "sig",
        "alg": "RS256",
        "n": _b64_uint(public_key.n),
        "e": _b64_uint(public_key.e),
    }
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    return private_pem, jwk


class FakeOidcProvider:
    def __init__(self):
        self.port = _free_port()
        self.issuer = f"http://127.0.0.1:{self.port}"
        self.authorization_endpoint = f"{self.issuer}/authorize"
        self.token_endpoint = f"{self.issuer}/token"
        self.jwks_uri = f"{self.issuer}/jwks"
        self.userinfo_endpoint = f"{self.issuer}/userinfo"
        self._private_pem, self._jwk = build_rsa_signer()
        self._token_claims = {}
        self._userinfo = {}
        self._lock = threading.Lock()
        self._server = ThreadingHTTPServer(("127.0.0.1", self.port), self._build_handler())
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)

    def _build_handler(self):
        provider = self

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                parsed = urlparse(self.path)
                if parsed.path == "/.well-known/openid-configuration":
                    self._json(
                        {
                            "issuer": provider.issuer,
                            "authorization_endpoint": provider.authorization_endpoint,
                            "token_endpoint": provider.token_endpoint,
                            "jwks_uri": provider.jwks_uri,
                            "userinfo_endpoint": provider.userinfo_endpoint,
                        }
                    )
                    return
                if parsed.path == "/jwks":
                    self._json({"keys": [provider._jwk]})
                    return
                if parsed.path == "/userinfo":
                    with provider._lock:
                        payload = dict(provider._userinfo)
                    self._json(payload)
                    return
                self.send_response(404)
                self.end_headers()

            def do_POST(self):
                parsed = urlparse(self.path)
                if parsed.path != "/token":
                    self.send_response(404)
                    self.end_headers()
                    return
                with provider._lock:
                    claims = dict(provider._token_claims)
                token = jwt.encode(claims, provider._private_pem, algorithm="RS256", headers={"kid": "test-key"})
                self._json({"access_token": "access-token", "id_token": token, "token_type": "Bearer"})

            def _json(self, payload):
                data = json.dumps(payload).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def log_message(self, format, *args):  # noqa: A003
                return

        return Handler

    def set_profile(self, token_claims: dict, userinfo: dict | None = None):
        with self._lock:
            self._token_claims = dict(token_claims)
            self._userinfo = dict(userinfo or {})

    def start(self):
        self._thread.start()

    def stop(self):
        self._server.shutdown()
        self._server.server_close()
        self._thread.join(timeout=5)


@pytest.fixture
def oidc_provider():
    provider = FakeOidcProvider()
    provider.start()
    try:
        yield provider
    finally:
        provider.stop()


def _wait_for_backend(base_url: str, process: subprocess.Popen, timeout: float = 20.0) -> None:
    start = time.time()
    while time.time() - start < timeout:
        if process.poll() is not None:
            output = process.stdout.read() if process.stdout else ""
            raise RuntimeError(f"Backend exited early for {base_url}\n{output}")
        try:
            response = requests.get(f"{base_url}/", timeout=1)
            if response.status_code == 200:
                return
        except requests.RequestException:
            pass
        time.sleep(0.25)
    output = process.stdout.read() if process.stdout else ""
    raise RuntimeError(f"Backend did not start at {base_url}\n{output}")


@pytest.fixture
def app_ctx(tmp_path):
    db_path = tmp_path / "app.db"
    port = _free_port()
    base_url = f"http://127.0.0.1:{port}"

    env = os.environ.copy()
    env.update(
        {
            "PYTHONUNBUFFERED": "1",
            "SQLITE_PATH": db_path.as_posix(),
            "JWT_SECRET": "test-secret",
            "CORS_ORIGINS": "http://frontend.test",
            "ADMIN_EMAIL": "admin@example.com",
            "ADMIN_PASSWORD": "admin123",
            "SEED_EDITOR_EMAIL": "editor@example.com",
            "SEED_EDITOR_PASSWORD": "editor123",
            "SEED_USER_EMAIL": "user@example.com",
            "SEED_USER_PASSWORD": "user123",
        }
    )
    env.pop("OIDC_CLIENT_SECRET_OVERRIDE", None)
    env.pop("FRONTEND_BASE_URL", None)

    process = subprocess.Popen(
        [str(PYTHON), "-m", "uvicorn", "server:app", "--host", "127.0.0.1", "--port", str(port)],
        cwd=str(ROOT),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    session = None
    try:
        _wait_for_backend(base_url, process)
        session = TimeoutSession()
        yield {
            "session": session,
            "api": f"{base_url}/api",
            "db_path": db_path,
        }
    finally:
        if session is not None:
            session.close()
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()


def login_admin(session: requests.Session, api: str) -> str:
    response = session.post(f"{api}/auth/login", json={"email": "admin@example.com", "password": "admin123"})
    assert response.status_code == 200, response.text
    return session.cookies.get("csrf_token")


def save_oidc_settings(session: requests.Session, api: str, issuer_url: str, csrf: str, **overrides):
    payload = {
        "self_register_enabled": True,
        "oidc_enabled": True,
        "editors_see_all_roadmaps": True,
        "oidc_display_name": "Contoso SSO",
        "oidc_issuer_url": issuer_url,
        "oidc_client_id": "roadmap-client",
        "client_secret": "db-secret",
        "oidc_scopes": "openid profile email groups",
        "oidc_email_claim": "email",
        "oidc_name_claim": "name",
        "oidc_role_claim": "groups",
        "oidc_role_values_user": "roadmap-user",
        "oidc_role_values_editor": "roadmap-editor",
        "oidc_role_values_admin": "roadmap-admin",
    }
    payload.update(overrides)
    response = session.put(f"{api}/admin/auth/settings", json=payload, headers={"X-CSRF-Token": csrf})
    assert response.status_code == 200, response.text
    return response.json()


def save_visibility_settings(session: requests.Session, api: str, csrf: str, **overrides):
    payload = {
        "editors_see_all_roadmaps": True,
        "mappings": [],
    }
    payload.update(overrides)
    response = session.put(f"{api}/admin/roadmap-visibility-settings", json=payload, headers={"X-CSRF-Token": csrf})
    assert response.status_code == 200, response.text
    return response.json()


def start_oidc_flow(session: requests.Session, api: str) -> tuple[str, dict]:
    response = session.get(f"{api}/auth/oidc/start", params={"next": "/dashboard"}, allow_redirects=False)
    assert response.status_code == 302, response.text
    state = parse_qs(urlparse(response.headers["location"]).query)["state"][0]
    payload = jwt.decode(session.cookies.get("oidc_state"), "test-secret", algorithms=["HS256"])
    return state, payload


def fetch_scalar(db_path: Path, query: str, params: tuple = ()):
    with sqlite3.connect(db_path) as conn:
        row = conn.execute(query, params).fetchone()
    return row


def create_roadmap(session: requests.Session, api: str, csrf: str, *, slug: str, title: str, tags: str, status: str = "published"):
    response = session.post(
        f"{api}/roadmaps",
        json={
            "slug": slug,
            "title": title,
            "description": title,
            "cover_emoji": "T",
            "status": status,
            "tags": tags,
            "level": "mixed",
        },
        headers={"X-CSRF-Token": csrf},
    )
    assert response.status_code == 201, response.text
    return response.json()


class TestAuthSettings:
    def test_admin_auth_settings_mask_secret(self, app_ctx, oidc_provider):
        session = app_ctx["session"]
        api = app_ctx["api"]

        csrf = login_admin(session, api)
        saved = save_oidc_settings(session, api, oidc_provider.issuer, csrf)

        assert saved["has_client_secret"] is True
        assert saved["secret_source"] == "database"
        assert "client_secret" not in saved

        response = session.get(f"{api}/admin/auth/settings")
        assert response.status_code == 200
        body = response.json()
        assert body["oidc_display_name"] == "Contoso SSO"
        assert body["has_client_secret"] is True
        assert body["configured"] is True
        assert "client_secret" not in body

    def test_auth_options_reflect_toggles(self, app_ctx, oidc_provider):
        session = app_ctx["session"]
        api = app_ctx["api"]

        csrf = login_admin(session, api)
        save_oidc_settings(session, api, oidc_provider.issuer, csrf, self_register_enabled=False)

        response = session.get(f"{api}/auth/options")
        assert response.status_code == 200
        body = response.json()
        assert body["local_login_enabled"] is True
        assert body["self_register_enabled"] is False
        assert body["oidc"]["enabled"] is True
        assert body["oidc"]["display_name"] == "Contoso SSO"

    def test_register_forbidden_when_self_register_disabled(self, app_ctx, oidc_provider):
        session = app_ctx["session"]
        api = app_ctx["api"]

        csrf = login_admin(session, api)
        save_oidc_settings(session, api, oidc_provider.issuer, csrf, self_register_enabled=False, oidc_enabled=False)

        response = session.post(
            f"{api}/auth/register",
            json={"email": "new@example.com", "name": "New User", "password": "secret123"},
        )
        assert response.status_code == 403
        assert response.json()["detail"] == "Self-registration is disabled"

    def test_oidc_start_rejects_when_disabled(self, app_ctx):
        response = app_ctx["session"].get(f"{app_ctx['api']}/auth/oidc/start", allow_redirects=False)
        assert response.status_code == 403


class TestOidcFlow:
    def test_oidc_callback_creates_user_and_sets_session(self, app_ctx, oidc_provider):
        session = app_ctx["session"]
        api = app_ctx["api"]

        csrf = login_admin(session, api)
        save_oidc_settings(session, api, oidc_provider.issuer, csrf)
        state, state_payload = start_oidc_flow(session, api)

        oidc_provider.set_profile(
            {
                "iss": oidc_provider.issuer,
                "sub": "oidc-user-1",
                "aud": "roadmap-client",
                "exp": 4102444800,
                "iat": 1700000000,
                "nonce": state_payload["nonce"],
                "name": "OIDC Person",
            },
            userinfo={
                "email": "oidc.user@example.com",
                "email_verified": True,
                "groups": ["roadmap-admin"],
            },
        )

        response = session.get(f"{api}/auth/oidc/callback", params={"code": "auth-code", "state": state}, allow_redirects=False)
        assert response.status_code == 302
        assert response.headers["location"] == "http://frontend.test/dashboard"

        me = session.get(f"{api}/auth/me")
        assert me.status_code == 200
        assert me.json()["email"] == "oidc.user@example.com"
        assert me.json()["role"] == "admin"

        user = fetch_scalar(app_ctx["db_path"], "SELECT id, password_hash FROM users WHERE email = ?", ("oidc.user@example.com",))
        assert user is not None
        assert user[1] is None
        linked = fetch_scalar(app_ctx["db_path"], "SELECT COUNT(*) FROM external_identities WHERE user_id = ?", (user[0],))
        assert linked[0] == 1

    def test_oidc_links_existing_verified_email(self, app_ctx, oidc_provider):
        session = app_ctx["session"]
        api = app_ctx["api"]

        register = session.post(
            f"{api}/auth/register",
            json={"email": "linked@example.com", "name": "Local Linked", "password": "secret123"},
        )
        assert register.status_code == 201, register.text
        session.post(f"{api}/auth/logout", headers={"X-CSRF-Token": session.cookies.get("csrf_token")})

        csrf = login_admin(session, api)
        save_oidc_settings(session, api, oidc_provider.issuer, csrf)
        session.post(f"{api}/auth/logout", headers={"X-CSRF-Token": session.cookies.get("csrf_token")})

        existing = fetch_scalar(app_ctx["db_path"], "SELECT id FROM users WHERE email = ?", ("linked@example.com",))
        state, state_payload = start_oidc_flow(session, api)
        oidc_provider.set_profile(
            {
                "iss": oidc_provider.issuer,
                "sub": "oidc-user-2",
                "aud": "roadmap-client",
                "exp": 4102444800,
                "iat": 1700000000,
                "nonce": state_payload["nonce"],
                "email": "linked@example.com",
                "email_verified": True,
                "groups": ["roadmap-user"],
            }
        )

        response = session.get(f"{api}/auth/oidc/callback", params={"code": "auth-code", "state": state}, allow_redirects=False)
        assert response.status_code == 302

        current = fetch_scalar(app_ctx["db_path"], "SELECT id FROM users WHERE email = ?", ("linked@example.com",))
        assert current[0] == existing[0]
        linked = fetch_scalar(app_ctx["db_path"], "SELECT COUNT(*) FROM external_identities WHERE user_id = ?", (existing[0],))
        assert linked[0] == 1

    def test_oidc_rejects_unauthorized_role(self, app_ctx, oidc_provider):
        session = app_ctx["session"]
        api = app_ctx["api"]

        csrf = login_admin(session, api)
        save_oidc_settings(session, api, oidc_provider.issuer, csrf)
        state, state_payload = start_oidc_flow(session, api)
        oidc_provider.set_profile(
            {
                "iss": oidc_provider.issuer,
                "sub": "oidc-user-3",
                "aud": "roadmap-client",
                "exp": 4102444800,
                "iat": 1700000000,
                "nonce": state_payload["nonce"],
                "email": "blocked@example.com",
                "email_verified": True,
                "groups": ["unknown-group"],
            }
        )

        response = session.get(f"{api}/auth/oidc/callback", params={"code": "auth-code", "state": state}, allow_redirects=False)
        assert response.status_code == 403
        assert "authorized role" in response.json()["detail"]

    def test_oidc_rejects_missing_verified_email(self, app_ctx, oidc_provider):
        session = app_ctx["session"]
        api = app_ctx["api"]

        csrf = login_admin(session, api)
        save_oidc_settings(session, api, oidc_provider.issuer, csrf)
        state, state_payload = start_oidc_flow(session, api)
        oidc_provider.set_profile(
            {
                "iss": oidc_provider.issuer,
                "sub": "oidc-user-4",
                "aud": "roadmap-client",
                "exp": 4102444800,
                "iat": 1700000000,
                "nonce": state_payload["nonce"],
                "email": "unverified@example.com",
                "email_verified": False,
                "groups": ["roadmap-user"],
            }
        )

        response = session.get(f"{api}/auth/oidc/callback", params={"code": "auth-code", "state": state}, allow_redirects=False)
        assert response.status_code == 403
        assert "verified email" in response.json()["detail"]

    def test_oidc_rejects_state_mismatch(self, app_ctx, oidc_provider):
        session = app_ctx["session"]
        api = app_ctx["api"]

        csrf = login_admin(session, api)
        save_oidc_settings(session, api, oidc_provider.issuer, csrf)
        _, state_payload = start_oidc_flow(session, api)
        oidc_provider.set_profile(
            {
                "iss": oidc_provider.issuer,
                "sub": "oidc-user-5",
                "aud": "roadmap-client",
                "exp": 4102444800,
                "iat": 1700000000,
                "nonce": state_payload["nonce"],
                "email": "person@example.com",
                "email_verified": True,
                "groups": ["roadmap-user"],
            }
        )

        response = session.get(f"{api}/auth/oidc/callback", params={"code": "auth-code", "state": "wrong-state"}, allow_redirects=False)
        assert response.status_code == 400
        assert response.json()["detail"] == "OIDC state mismatch"


class TestRoadmapVisibility:
    def test_visibility_settings_round_trip(self, app_ctx):
        session = app_ctx["session"]
        api = app_ctx["api"]

        csrf = login_admin(session, api)
        saved = save_visibility_settings(
            session,
            api,
            csrf,
            editors_see_all_roadmaps=False,
            mappings=[{"role_name": "ABF", "tags": "dev,nouveau"}],
        )

        assert saved["editors_see_all_roadmaps"] is False
        assert saved["mappings"][0]["role_name"] == "ABF"
        assert saved["mappings"][0]["role_key"] == "abf"
        assert saved["mappings"][0]["tags"] == "dev,nouveau"

        response = session.get(f"{api}/admin/roadmap-visibility-settings")
        assert response.status_code == 200
        body = response.json()
        assert body["editors_see_all_roadmaps"] is False
        assert body["mappings"][0]["role_key"] == "abf"

    def test_oidc_user_sees_only_matching_published_roadmaps(self, app_ctx, oidc_provider):
        session = app_ctx["session"]
        api = app_ctx["api"]

        csrf = login_admin(session, api)
        save_oidc_settings(session, api, oidc_provider.issuer, csrf)
        save_visibility_settings(
            session,
            api,
            csrf,
            editors_see_all_roadmaps=False,
            mappings=[{"role_name": "ABF", "tags": "dev,nouveau"}],
        )
        create_roadmap(session, api, csrf, slug="oidc-dev", title="OIDC Dev", tags="dev,internal")
        create_roadmap(session, api, csrf, slug="oidc-ops", title="OIDC Ops", tags="ops")
        session.post(f"{api}/auth/logout", headers={"X-CSRF-Token": session.cookies.get("csrf_token")})

        anon = requests.get(f"{api}/roadmaps", timeout=REQUEST_TIMEOUT)
        assert anon.status_code == 200
        anon_slugs = {entry["slug"] for entry in anon.json()}
        assert "oidc-dev" not in anon_slugs
        assert "oidc-ops" not in anon_slugs
        assert "frontend" in anon_slugs

        state, state_payload = start_oidc_flow(session, api)
        oidc_provider.set_profile(
            {
                "iss": oidc_provider.issuer,
                "sub": "oidc-visible-user",
                "aud": "roadmap-client",
                "exp": 4102444800,
                "iat": 1700000000,
                "nonce": state_payload["nonce"],
                "email": "visible@example.com",
                "email_verified": True,
                "groups": ["ABF", "roadmap-user"],
            }
        )

        callback = session.get(f"{api}/auth/oidc/callback", params={"code": "auth-code", "state": state}, allow_redirects=False)
        assert callback.status_code == 302

        catalog = session.get(f"{api}/roadmaps")
        assert catalog.status_code == 200
        slugs = {entry["slug"] for entry in catalog.json()}
        assert "oidc-dev" in slugs
        assert "oidc-ops" not in slugs

        detail = session.get(f"{api}/roadmaps/oidc-dev")
        assert detail.status_code == 200
        assert detail.json()["tags"] == "dev,internal"

        hidden_detail = session.get(f"{api}/roadmaps/oidc-ops")
        assert hidden_detail.status_code == 404

        tags = session.get(f"{api}/tags")
        assert tags.status_code == 200
        tag_values = tags.json()
        assert "public" not in tag_values
        assert "dev" in tag_values

        user_row = fetch_scalar(app_ctx["db_path"], "SELECT oidc_roles FROM users WHERE email = ?", ("visible@example.com",))
        assert user_row[0] == "abf,roadmap-user"

    def test_local_login_keeps_last_known_oidc_roles(self, app_ctx, oidc_provider):
        session = app_ctx["session"]
        api = app_ctx["api"]

        register = session.post(
            f"{api}/auth/register",
            json={"email": "linked-visible@example.com", "name": "Linked Visible", "password": "secret123"},
        )
        assert register.status_code == 201, register.text
        session.post(f"{api}/auth/logout", headers={"X-CSRF-Token": session.cookies.get("csrf_token")})

        csrf = login_admin(session, api)
        save_oidc_settings(session, api, oidc_provider.issuer, csrf)
        save_visibility_settings(
            session,
            api,
            csrf,
            editors_see_all_roadmaps=False,
            mappings=[{"role_name": "ABF", "tags": "dev"}],
        )
        create_roadmap(session, api, csrf, slug="linked-dev", title="Linked Dev", tags="dev")
        session.post(f"{api}/auth/logout", headers={"X-CSRF-Token": session.cookies.get("csrf_token")})

        state, state_payload = start_oidc_flow(session, api)
        oidc_provider.set_profile(
            {
                "iss": oidc_provider.issuer,
                "sub": "oidc-linked-visible",
                "aud": "roadmap-client",
                "exp": 4102444800,
                "iat": 1700000000,
                "nonce": state_payload["nonce"],
                "email": "linked-visible@example.com",
                "email_verified": True,
                "groups": ["ABF", "roadmap-user"],
            }
        )
        callback = session.get(f"{api}/auth/oidc/callback", params={"code": "auth-code", "state": state}, allow_redirects=False)
        assert callback.status_code == 302
        session.post(f"{api}/auth/logout", headers={"X-CSRF-Token": session.cookies.get("csrf_token")})

        local_login = session.post(
            f"{api}/auth/login",
            json={"email": "linked-visible@example.com", "password": "secret123"},
        )
        assert local_login.status_code == 200, local_login.text

        catalog = session.get(f"{api}/roadmaps")
        assert catalog.status_code == 200
        slugs = {entry["slug"] for entry in catalog.json()}
        assert "linked-dev" in slugs

        user_row = fetch_scalar(app_ctx["db_path"], "SELECT oidc_roles FROM users WHERE email = ?", ("linked-visible@example.com",))
        assert user_row[0] == "abf,roadmap-user"

    def test_editor_toggle_controls_catalog_but_admin_endpoint_still_allows_management(self, app_ctx):
        session = app_ctx["session"]
        api = app_ctx["api"]

        csrf = login_admin(session, api)
        save_visibility_settings(session, api, csrf, editors_see_all_roadmaps=False, mappings=[])
        create_roadmap(session, api, csrf, slug="editor-hidden", title="Editor Hidden", tags="secret")
        session.post(f"{api}/auth/logout", headers={"X-CSRF-Token": session.cookies.get("csrf_token")})

        editor_login = session.post(
            f"{api}/auth/login",
            json={"email": "editor@example.com", "password": "editor123"},
        )
        assert editor_login.status_code == 200, editor_login.text

        hidden_catalog = session.get(f"{api}/roadmaps")
        assert hidden_catalog.status_code == 200
        assert "editor-hidden" not in {entry["slug"] for entry in hidden_catalog.json()}

        hidden_detail = session.get(f"{api}/roadmaps/editor-hidden")
        assert hidden_detail.status_code == 404

        admin_detail = session.get(f"{api}/admin/roadmaps/detail/editor-hidden")
        assert admin_detail.status_code == 200

        session.post(f"{api}/auth/logout", headers={"X-CSRF-Token": session.cookies.get("csrf_token")})
        csrf = login_admin(session, api)
        save_visibility_settings(session, api, csrf, editors_see_all_roadmaps=True, mappings=[])
        session.post(f"{api}/auth/logout", headers={"X-CSRF-Token": session.cookies.get("csrf_token")})

        editor_login = session.post(
            f"{api}/auth/login",
            json={"email": "editor@example.com", "password": "editor123"},
        )
        assert editor_login.status_code == 200, editor_login.text

        visible_catalog = session.get(f"{api}/roadmaps")
        assert visible_catalog.status_code == 200
        assert "editor-hidden" in {entry["slug"] for entry in visible_catalog.json()}
