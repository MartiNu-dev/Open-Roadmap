"""Helpers for enterprise authentication settings and OIDC flows."""
from __future__ import annotations

import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

import jwt
import requests
from fastapi import HTTPException, Request, status
from sqlalchemy.orm import Session

from auth import JWT_ALGORITHM, _jwt_secret
from models import AuthSettings, ExternalIdentity, User

DEFAULT_OIDC_DISPLAY_NAME = "Enterprise SSO"
DEFAULT_OIDC_SCOPES = "openid profile email"
DEFAULT_EMAIL_CLAIM = "email"
DEFAULT_NAME_CLAIM = "name"
DEFAULT_ROLE_CLAIM = "roles"
DEFAULT_ROLE_VALUES = {
    "user": "user",
    "editor": "editor",
    "admin": "admin",
}
FRONTEND_BASE_URL_ENV = "FRONTEND_BASE_URL"
OIDC_CLIENT_SECRET_OVERRIDE_ENV = "OIDC_CLIENT_SECRET_OVERRIDE"
OIDC_REDIRECT_URI_OVERRIDE_ENV = "OIDC_REDIRECT_URI_OVERRIDE"
OIDC_STATE_COOKIE = "oidc_state"
OIDC_STATE_TTL_SECONDS = 600
OIDC_PROVIDER_TYPE = "oidc"
LOCAL_PROVIDER_TYPE = "local"
logger = logging.getLogger("roadmap.oidc")


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def _response_excerpt(response: Optional[requests.Response], limit: int = 500) -> str:
    if response is None:
        return ""
    try:
        text = (response.text or "").strip()
    except Exception:  # pragma: no cover - defensive
        return ""
    if len(text) > limit:
        return f"{text[:limit]}..."
    return text


def normalize_relative_next(next_path: Optional[str]) -> str:
    if not next_path or not next_path.startswith("/") or next_path.startswith("//") or "\\" in next_path:
        return "/dashboard"
    return next_path


def normalize_list_csv(raw: Optional[str], *, lowercase: bool = False) -> str:
    if not raw:
        return ""
    seen = set()
    items = []
    for item in str(raw).split(","):
        value = item.strip()
        if lowercase:
            value = value.lower()
        if value and value not in seen:
            seen.add(value)
            items.append(value)
    return ",".join(items)


def split_csv(raw: Optional[str], *, lowercase: bool = False) -> list[str]:
    normalized = normalize_list_csv(raw, lowercase=lowercase)
    return normalized.split(",") if normalized else []


def normalize_scopes(raw: Optional[str]) -> str:
    text = (raw or DEFAULT_OIDC_SCOPES).strip()
    seen = set()
    scopes = []
    for scope in text.split():
        if scope and scope not in seen:
            seen.add(scope)
            scopes.append(scope)
    return " ".join(scopes) or DEFAULT_OIDC_SCOPES


def get_or_create_auth_settings(db: Session) -> AuthSettings:
    settings = db.query(AuthSettings).filter(AuthSettings.id == 1).first()
    if settings is None:
        settings = AuthSettings(id=1)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    return settings


def get_effective_oidc_secret(settings: AuthSettings) -> tuple[Optional[str], str]:
    env_secret = os.environ.get(OIDC_CLIENT_SECRET_OVERRIDE_ENV)
    if env_secret:
        return env_secret, "environment"
    if settings.oidc_client_secret:
        return settings.oidc_client_secret, "database"
    return None, "none"


def is_oidc_configured(settings: AuthSettings) -> bool:
    secret, _ = get_effective_oidc_secret(settings)
    return bool(settings.oidc_issuer_url.strip() and settings.oidc_client_id.strip() and secret)


def auth_settings_to_dict(settings: AuthSettings) -> dict[str, Any]:
    secret, source = get_effective_oidc_secret(settings)
    configured = is_oidc_configured(settings)
    redirect_uri_override = (os.environ.get(OIDC_REDIRECT_URI_OVERRIDE_ENV) or "").strip()
    return {
        "self_register_enabled": bool(settings.self_register_enabled),
        "oidc_enabled": bool(settings.oidc_enabled),
        "editors_see_all_roadmaps": bool(settings.editors_see_all_roadmaps),
        "oidc_display_name": settings.oidc_display_name or DEFAULT_OIDC_DISPLAY_NAME,
        "oidc_issuer_url": settings.oidc_issuer_url or "",
        "oidc_client_id": settings.oidc_client_id or "",
        "oidc_scopes": settings.oidc_scopes or DEFAULT_OIDC_SCOPES,
        "oidc_email_claim": settings.oidc_email_claim or DEFAULT_EMAIL_CLAIM,
        "oidc_name_claim": settings.oidc_name_claim or DEFAULT_NAME_CLAIM,
        "oidc_role_claim": settings.oidc_role_claim or DEFAULT_ROLE_CLAIM,
        "oidc_role_values_user": settings.oidc_role_values_user or DEFAULT_ROLE_VALUES["user"],
        "oidc_role_values_editor": settings.oidc_role_values_editor or DEFAULT_ROLE_VALUES["editor"],
        "oidc_role_values_admin": settings.oidc_role_values_admin or DEFAULT_ROLE_VALUES["admin"],
        "has_client_secret": bool(secret),
        "secret_source": source,
        "configured": configured,
        "callback_url_override": redirect_uri_override or None,
        "callback_url_overridden": bool(redirect_uri_override),
    }


def auth_options_to_dict(settings: AuthSettings) -> dict[str, Any]:
    return {
        "local_login_enabled": True,
        "self_register_enabled": bool(settings.self_register_enabled),
        "oidc": {
            "enabled": bool(settings.oidc_enabled and is_oidc_configured(settings)),
            "display_name": settings.oidc_display_name or DEFAULT_OIDC_DISPLAY_NAME,
        },
    }


def apply_auth_settings_update(settings: AuthSettings, payload: dict[str, Any]) -> None:
    settings.self_register_enabled = bool(payload["self_register_enabled"])
    settings.oidc_enabled = bool(payload["oidc_enabled"])
    if payload.get("editors_see_all_roadmaps") is not None:
        settings.editors_see_all_roadmaps = bool(payload["editors_see_all_roadmaps"])
    settings.oidc_display_name = (payload["oidc_display_name"] or DEFAULT_OIDC_DISPLAY_NAME).strip()
    settings.oidc_issuer_url = (payload["oidc_issuer_url"] or "").strip().rstrip("/")
    settings.oidc_client_id = (payload["oidc_client_id"] or "").strip()
    settings.oidc_scopes = normalize_scopes(payload.get("oidc_scopes"))
    settings.oidc_email_claim = (payload.get("oidc_email_claim") or DEFAULT_EMAIL_CLAIM).strip()
    settings.oidc_name_claim = (payload.get("oidc_name_claim") or DEFAULT_NAME_CLAIM).strip()
    settings.oidc_role_claim = (payload.get("oidc_role_claim") or DEFAULT_ROLE_CLAIM).strip()
    settings.oidc_role_values_user = normalize_list_csv(payload.get("oidc_role_values_user")) or DEFAULT_ROLE_VALUES["user"]
    settings.oidc_role_values_editor = normalize_list_csv(payload.get("oidc_role_values_editor")) or DEFAULT_ROLE_VALUES["editor"]
    settings.oidc_role_values_admin = normalize_list_csv(payload.get("oidc_role_values_admin")) or DEFAULT_ROLE_VALUES["admin"]

    if "client_secret" in payload:
        secret = payload.get("client_secret")
        if secret is not None:
            stripped = secret.strip()
            settings.oidc_client_secret = stripped or None


def ensure_oidc_enabled(settings: AuthSettings) -> None:
    if not settings.oidc_enabled:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="OIDC login is disabled")
    if not is_oidc_configured(settings):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="OIDC is not fully configured")


def create_oidc_state_cookie(next_path: str) -> tuple[str, str]:
    state = secrets.token_urlsafe(24)
    nonce = secrets.token_urlsafe(24)
    payload = {
        "type": "oidc_state",
        "state": state,
        "nonce": nonce,
        "next": normalize_relative_next(next_path),
        "exp": utcnow() + timedelta(seconds=OIDC_STATE_TTL_SECONDS),
    }
    return state, jwt.encode(payload, _jwt_secret(), algorithm=JWT_ALGORITHM)


def decode_oidc_state_cookie(token: str) -> dict[str, Any]:
    try:
        payload = jwt.decode(token, _jwt_secret(), algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OIDC login session expired") from exc
    except jwt.InvalidTokenError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid OIDC login session") from exc
    if payload.get("type") != "oidc_state":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid OIDC login session")
    return payload


def build_discovery_url(issuer_url: str) -> str:
    return f"{issuer_url.rstrip('/')}/.well-known/openid-configuration"


def fetch_oidc_discovery(settings: AuthSettings) -> dict[str, Any]:
    discovery_url = build_discovery_url(settings.oidc_issuer_url)
    try:
        response = requests.get(discovery_url, timeout=10)
        response.raise_for_status()
    except requests.RequestException as exc:
        response = getattr(exc, "response", None)
        logger.exception(
            "OIDC discovery failed issuer=%s discovery_url=%s status=%s body=%s",
            settings.oidc_issuer_url,
            discovery_url,
            getattr(response, "status_code", None),
            _response_excerpt(response),
        )
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Unable to load OIDC discovery document") from exc
    data = response.json()
    required = ("issuer", "authorization_endpoint", "token_endpoint", "jwks_uri")
    if any(not data.get(key) for key in required):
        logger.error(
            "OIDC discovery incomplete issuer=%s discovery_url=%s keys_present=%s",
            settings.oidc_issuer_url,
            discovery_url,
            sorted(k for k, v in data.items() if v),
        )
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="OIDC discovery document is incomplete")
    return data


def build_redirect_uri(request: Request) -> str:
    override = (os.environ.get(OIDC_REDIRECT_URI_OVERRIDE_ENV) or "").strip()
    if override:
        if override.startswith(("http://", "https://")):
            logger.info("OIDC redirect URI override active redirect_uri=%s", override)
            return override
        logger.error("OIDC redirect URI override invalid value=%s", override)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="OIDC redirect URI override must be an absolute http(s) URL",
        )
    return str(request.url_for("auth_oidc_callback"))


def build_authorization_url(settings: AuthSettings, discovery: dict[str, Any], request: Request, state: str, nonce: str) -> str:
    scopes = normalize_scopes(settings.oidc_scopes)
    params = {
        "client_id": settings.oidc_client_id,
        "response_type": "code",
        "redirect_uri": build_redirect_uri(request),
        "scope": scopes,
        "state": state,
        "nonce": nonce,
    }
    prepared = requests.PreparedRequest()
    prepared.prepare_url(discovery["authorization_endpoint"], params)
    return prepared.url


def build_logout_redirect_url(settings: AuthSettings, discovery: dict[str, Any], request: Request, next_path: str = "/") -> Optional[str]:
    end_session_endpoint = discovery.get("end_session_endpoint")
    if not end_session_endpoint:
        logger.warning("OIDC logout endpoint missing issuer=%s", discovery.get("issuer"))
        return None

    params = {
        "post_logout_redirect_uri": frontend_redirect_url(request, next_path),
        "client_id": settings.oidc_client_id,
    }
    prepared = requests.PreparedRequest()
    prepared.prepare_url(end_session_endpoint, params)
    return prepared.url


def exchange_code_for_tokens(settings: AuthSettings, discovery: dict[str, Any], code: str, request: Request) -> dict[str, Any]:
    secret, _ = get_effective_oidc_secret(settings)
    redirect_uri = build_redirect_uri(request)
    try:
        response = requests.post(
            discovery["token_endpoint"],
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirect_uri,
            },
            auth=(settings.oidc_client_id, secret or ""),
            headers={"Accept": "application/json"},
            timeout=10,
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        response = getattr(exc, "response", None)
        logger.exception(
            "OIDC token exchange failed issuer=%s token_endpoint=%s client_id=%s redirect_uri=%s status=%s body=%s",
            settings.oidc_issuer_url,
            discovery.get("token_endpoint"),
            settings.oidc_client_id,
            redirect_uri,
            getattr(response, "status_code", None),
            _response_excerpt(response),
        )
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="OIDC token exchange failed") from exc
    data = response.json()
    if not data.get("id_token"):
        logger.error(
            "OIDC token response missing id_token issuer=%s token_endpoint=%s keys=%s",
            settings.oidc_issuer_url,
            discovery.get("token_endpoint"),
            sorted(data.keys()),
        )
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="OIDC token response did not include an id_token")
    return data


def _find_jwk(keys: list[dict[str, Any]], kid: Optional[str]) -> dict[str, Any]:
    if kid:
        for key in keys:
            if key.get("kid") == kid:
                return key
    if len(keys) == 1:
        return keys[0]
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unable to find a matching OIDC signing key")


def validate_id_token(settings: AuthSettings, discovery: dict[str, Any], id_token: str, nonce: str) -> dict[str, Any]:
    try:
        header = jwt.get_unverified_header(id_token)
    except jwt.InvalidTokenError as exc:
        logger.exception("OIDC id_token header invalid issuer=%s", settings.oidc_issuer_url)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OIDC id_token is invalid") from exc

    algorithm = header.get("alg")
    if not algorithm or str(algorithm).upper().startswith("HS"):
        logger.error("OIDC unsupported signing algorithm issuer=%s alg=%s", settings.oidc_issuer_url, algorithm)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported OIDC signing algorithm")

    try:
        jwks_response = requests.get(discovery["jwks_uri"], timeout=10)
        jwks_response.raise_for_status()
    except requests.RequestException as exc:
        response = getattr(exc, "response", None)
        logger.exception(
            "OIDC JWKS load failed issuer=%s jwks_uri=%s status=%s body=%s",
            settings.oidc_issuer_url,
            discovery.get("jwks_uri"),
            getattr(response, "status_code", None),
            _response_excerpt(response),
        )
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Unable to load OIDC signing keys") from exc

    keys = jwks_response.json().get("keys") or []
    if not keys:
        logger.error("OIDC JWKS empty issuer=%s jwks_uri=%s", settings.oidc_issuer_url, discovery.get("jwks_uri"))
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="OIDC signing key set is empty")

    jwk = _find_jwk(keys, header.get("kid"))
    try:
        key = jwt.PyJWK.from_dict(jwk).key
        claims = jwt.decode(
            id_token,
            key=key,
            algorithms=[algorithm],
            audience=settings.oidc_client_id,
            issuer=discovery["issuer"],
            leeway=30,
        )
    except jwt.PyJWTError as exc:
        logger.exception(
            "OIDC id_token validation failed issuer=%s audience=%s jwks_kid=%s",
            discovery.get("issuer"),
            settings.oidc_client_id,
            header.get("kid"),
        )
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OIDC id_token validation failed") from exc

    if claims.get("nonce") != nonce:
        logger.error("OIDC nonce mismatch issuer=%s expected_nonce=%s actual_nonce=%s", discovery.get("issuer"), nonce, claims.get("nonce"))
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OIDC nonce mismatch")
    return claims


def fetch_userinfo(discovery: dict[str, Any], access_token: Optional[str]) -> dict[str, Any]:
    endpoint = discovery.get("userinfo_endpoint")
    if not endpoint or not access_token:
        return {}
    try:
        response = requests.get(
            endpoint,
            headers={"Authorization": f"Bearer {access_token}", "Accept": "application/json"},
            timeout=10,
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        response = getattr(exc, "response", None)
        logger.exception(
            "OIDC userinfo request failed issuer=%s userinfo_endpoint=%s status=%s body=%s",
            discovery.get("issuer"),
            endpoint,
            getattr(response, "status_code", None),
            _response_excerpt(response),
        )
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="OIDC userinfo request failed") from exc
    return response.json()


def get_claim(data: dict[str, Any], claim_name: str) -> Any:
    current: Any = data
    for part in claim_name.split("."):
        if not isinstance(current, dict) or part not in current:
            return None
        current = current[part]
    return current


def _claim_values(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    if isinstance(value, str):
        if "," in value:
            return [item.strip() for item in value.split(",") if item.strip()]
        text = value.strip()
        return [text] if text else []
    text = str(value).strip()
    return [text] if text else []


def normalize_claim_values_csv(value: Any, *, lowercase: bool = False) -> str:
    seen = set()
    items = []
    for item in _claim_values(value):
        normalized = item.strip()
        if lowercase:
            normalized = normalized.lower()
        if normalized and normalized not in seen:
            seen.add(normalized)
            items.append(normalized)
    return ",".join(items)


def _is_truthy(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(value)


def resolve_oidc_profile(settings: AuthSettings, id_claims: dict[str, Any], userinfo: dict[str, Any]) -> dict[str, Any]:
    email_claim = settings.oidc_email_claim or DEFAULT_EMAIL_CLAIM
    name_claim = settings.oidc_name_claim or DEFAULT_NAME_CLAIM
    role_claim = settings.oidc_role_claim or DEFAULT_ROLE_CLAIM

    email = get_claim(id_claims, email_claim) or get_claim(userinfo, email_claim)
    name = get_claim(id_claims, name_claim) or get_claim(userinfo, name_claim)
    email_verified = get_claim(id_claims, "email_verified")
    if email_verified is None:
        email_verified = get_claim(userinfo, "email_verified")
    roles = get_claim(id_claims, role_claim)
    if roles is None:
        roles = get_claim(userinfo, role_claim)

    return {
        "subject": str(id_claims.get("sub") or get_claim(userinfo, "sub") or "").strip(),
        "email": str(email).strip().lower() if email else "",
        "name": str(name).strip() if name else "",
        "email_verified": _is_truthy(email_verified),
        "roles": roles,
    }


def resolve_role_from_claims(settings: AuthSettings, claim_value: Any) -> Optional[str]:
    values = set(_claim_values(claim_value))
    if not values:
        return None

    if values.intersection(split_csv(settings.oidc_role_values_admin)):
        return "admin"
    if values.intersection(split_csv(settings.oidc_role_values_editor)):
        return "editor"
    if values.intersection(split_csv(settings.oidc_role_values_user)):
        return "user"
    return None


def resolve_or_create_oidc_user(
    db: Session,
    settings: AuthSettings,
    discovery: dict[str, Any],
    profile: dict[str, Any],
) -> User:
    subject = profile["subject"]
    if not subject:
        logger.error("OIDC subject claim missing issuer=%s email=%s", discovery.get("issuer"), profile.get("email"))
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="OIDC subject claim is missing")

    email = profile["email"]
    if not email or not profile["email_verified"]:
        logger.error(
            "OIDC verified email missing issuer=%s subject=%s email=%s email_verified=%s",
            discovery.get("issuer"),
            subject,
            email,
            profile.get("email_verified"),
        )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="OIDC account must provide a verified email")

    role = resolve_role_from_claims(settings, profile["roles"])
    if role is None:
        logger.error(
            "OIDC role mapping rejected issuer=%s subject=%s email=%s role_claim=%s raw_roles=%s",
            discovery.get("issuer"),
            subject,
            email,
            settings.oidc_role_claim,
            profile.get("roles"),
        )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="OIDC account does not have an authorized role")

    provider_key = discovery["issuer"].rstrip("/")
    identity = (
        db.query(ExternalIdentity)
        .filter(
            ExternalIdentity.provider_type == OIDC_PROVIDER_TYPE,
            ExternalIdentity.provider_key == provider_key,
            ExternalIdentity.subject == subject,
        )
        .first()
    )

    linked_existing = identity is not None
    if identity is not None:
        user = identity.user
    else:
        user = db.query(User).filter(User.email == email).first()
        if user is None:
            display_name = profile["name"] or email.split("@", 1)[0]
            user = User(email=email, name=display_name, password_hash=None, role=role)
            db.add(user)
            db.flush()
        identity = ExternalIdentity(
            user_id=user.id,
            provider_type=OIDC_PROVIDER_TYPE,
            provider_key=provider_key,
            subject=subject,
            email_at_link=email,
        )
        db.add(identity)

    identity.email_at_link = email
    identity.last_login_at = utcnow()
    if profile["name"]:
        user.name = profile["name"]
    user.role = role
    user.oidc_roles = normalize_claim_values_csv(profile.get("roles"), lowercase=True)
    logger.info(
        "OIDC login resolved issuer=%s subject=%s email=%s user_id=%s role=%s linked_existing=%s",
        discovery.get("issuer"),
        subject,
        email,
        user.id,
        role,
        linked_existing,
    )
    db.commit()
    db.refresh(user)
    return user


def frontend_redirect_url(request: Request, next_path: str) -> str:
    base_url = os.environ.get(FRONTEND_BASE_URL_ENV)
    if not base_url:
        cors_origins = [origin.strip() for origin in os.environ.get("CORS_ORIGINS", "").split(",") if origin.strip()]
        base_url = cors_origins[0] if cors_origins else request.headers.get("origin")
    if not base_url:
        base_url = f"{request.url.scheme}://{request.url.netloc}"
    return f"{base_url.rstrip('/')}{normalize_relative_next(next_path)}"
