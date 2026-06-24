"""FastAPI app: auth + roadmaps + progress (Phase 1)."""
from dotenv import load_dotenv
load_dotenv()

import os
import secrets
import logging
import io
import json
import re
import zipfile
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, FastAPI, File, HTTPException, Query, Request, Response, UploadFile, status
from fastapi.responses import RedirectResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from enterprise_auth import (
    LOCAL_PROVIDER_TYPE,
    OIDC_STATE_COOKIE,
    OIDC_PROVIDER_TYPE,
    apply_auth_settings_update,
    auth_options_to_dict,
    auth_settings_to_dict,
    build_authorization_url,
    build_logout_redirect_url,
    create_oidc_state_cookie,
    decode_oidc_state_cookie,
    ensure_oidc_enabled,
    exchange_code_for_tokens,
    fetch_oidc_discovery,
    fetch_userinfo,
    frontend_redirect_url,
    get_or_create_auth_settings,
    resolve_oidc_profile,
    resolve_or_create_oidc_user,
    validate_id_token,
)
from database import Base, engine, get_db
from migrations import run_migrations
from models import AuthSettings, BlockResource, Roadmap, RoadmapBlock, RoadmapLink, User, UserProgress
from auth import (
    create_access_token,
    get_current_user,
    hash_password,
    require_roles,
    verify_password,
)
from schemas import (
    BlockOut,
    AuthOptionsOut,
    AuthSettingsOut,
    AuthSettingsUpdateIn,
    BlockPositionIn,
    BlockUpsertIn,
    LinkCreateIn,
    LinkOut,
    LinkUpdateIn,
    LoginIn,
    ProgressOut,
    ProgressUpsertIn,
    RegisterIn,
    ResourceCreateIn,
    ResourceReorderIn,
    ResourceOut,
    ResourceUpdateIn,
    RoadmapCreateIn,
    RoadmapDetail,
    RoadmapExportBlock,
    RoadmapExportEnvelope,
    RoadmapExportLink,
    RoadmapExportManifest,
    RoadmapExportManifestItem,
    RoadmapExportRequest,
    RoadmapExportResource,
    RoadmapExportRoadmap,
    RoadmapImportItemOut,
    RoadmapImportResult,
    RoadmapProgressSummary,
    RoadmapStatusIn,
    RoadmapSummary,
    RoadmapUpdateIn,
    RoleUpdateIn,
    TokenOut,
    UserOut,
)
from seed import seed_all

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("roadmap")
oidc_logger = logging.getLogger("roadmap.oidc")

app = FastAPI(title="Roadmap Platform API")
api = APIRouter(prefix="/api")
EXPORT_FORMAT = "open-roadmap-export"
EXPORT_VERSION = 1
FORBIDDEN_IMPORT_KEYS = {"id", "roadmap_id", "block_id", "from_block_id", "to_block_id"}
ROADMAP_SLUG_RE = re.compile(r"^[a-z0-9-]+$")


@app.on_event("startup")
def on_startup() -> None:
    Base.metadata.create_all(bind=engine)
    run_migrations(engine)
    from database import SessionLocal
    db = SessionLocal()
    try:
        seed_all(db)
        get_or_create_auth_settings(db)
        logger.info("Seed complete")
    except Exception:
        logger.exception("Seed failed")
        db.rollback()
    finally:
        db.close()


COOKIE_NAME = "access_token"
CSRF_COOKIE = "csrf_token"
AUTH_PROVIDER_COOKIE = "auth_provider"
COOKIE_KW = dict(httponly=True, samesite="lax", secure=False, path="/")
CSRF_COOKIE_KW = dict(httponly=False, samesite="lax", secure=False, path="/")


def _set_auth_cookies(response: Response, token: str) -> str:
    csrf = secrets.token_urlsafe(24)
    response.set_cookie(COOKIE_NAME, token, max_age=60 * 60 * 24 * 7, **COOKIE_KW)
    response.set_cookie(CSRF_COOKIE, csrf, max_age=60 * 60 * 24 * 7, **CSRF_COOKIE_KW)
    return csrf


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(COOKIE_NAME, path="/")
    response.delete_cookie(CSRF_COOKIE, path="/")
    response.delete_cookie(AUTH_PROVIDER_COOKIE, path="/")


def _set_oidc_state_cookie(response: Response, cookie_value: str) -> None:
    response.set_cookie(OIDC_STATE_COOKIE, cookie_value, max_age=600, **COOKIE_KW)


def _clear_oidc_state_cookie(response: Response) -> None:
    response.delete_cookie(OIDC_STATE_COOKIE, path="/")


def _set_auth_provider_cookie(response: Response, provider: str) -> None:
    response.set_cookie(AUTH_PROVIDER_COOKIE, provider, max_age=60 * 60 * 24 * 7, **COOKIE_KW)


# --------------- AUTH ---------------
@api.get("/auth/options", response_model=AuthOptionsOut)
def auth_options(db: Session = Depends(get_db)):
    settings = get_or_create_auth_settings(db)
    return auth_options_to_dict(settings)


@api.post("/auth/register", response_model=TokenOut, status_code=201)
def register(payload: RegisterIn, response: Response, db: Session = Depends(get_db)):
    settings = get_or_create_auth_settings(db)
    if not settings.self_register_enabled:
        raise HTTPException(status_code=403, detail="Self-registration is disabled")
    email = payload.email.lower().strip()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=409, detail="Email already registered")
    user = User(
        email=email,
        name=payload.name.strip(),
        password_hash=hash_password(payload.password),
        role="user",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(user.id, user.email, user.role)
    _set_auth_cookies(response, token)
    _set_auth_provider_cookie(response, LOCAL_PROVIDER_TYPE)
    return TokenOut(access_token=token, user=UserOut.model_validate(user))


@api.post("/auth/login", response_model=TokenOut)
def login(payload: LoginIn, response: Response, db: Session = Depends(get_db)):
    email = payload.email.lower().strip()
    user = db.query(User).filter(User.email == email).first()
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(user.id, user.email, user.role)
    _set_auth_cookies(response, token)
    _set_auth_provider_cookie(response, LOCAL_PROVIDER_TYPE)
    return TokenOut(access_token=token, user=UserOut.model_validate(user))


@api.post("/auth/logout")
def logout(response: Response, current: User = Depends(get_current_user)):
    _clear_auth_cookies(response)
    _clear_oidc_state_cookie(response)
    return {"ok": True}


@api.get("/auth/logout/browser")
def logout_browser(
    request: Request,
    next_path: str = Query(default="/", alias="next"),
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _ = current
    redirect_url = frontend_redirect_url(request, next_path)
    provider = request.cookies.get(AUTH_PROVIDER_COOKIE)
    response = RedirectResponse(url=redirect_url, status_code=status.HTTP_302_FOUND)
    _clear_auth_cookies(response)
    _clear_oidc_state_cookie(response)

    if provider == OIDC_PROVIDER_TYPE:
        settings = get_or_create_auth_settings(db)
        if settings.oidc_enabled:
            try:
                discovery = fetch_oidc_discovery(settings)
                logout_url = build_logout_redirect_url(settings, discovery, request, next_path)
                if logout_url:
                    oidc_logger.info(
                        "OIDC browser logout issuer=%s user_id=%s redirect_url=%s",
                        settings.oidc_issuer_url,
                        current.id,
                        logout_url,
                    )
                    response = RedirectResponse(url=logout_url, status_code=status.HTTP_302_FOUND)
                    _clear_auth_cookies(response)
                    _clear_oidc_state_cookie(response)
                    return response
            except HTTPException:
                oidc_logger.exception(
                    "OIDC browser logout fallback to local redirect issuer=%s user_id=%s",
                    settings.oidc_issuer_url,
                    current.id,
                )

    return response


@api.get("/auth/me", response_model=UserOut)
def me(current: User = Depends(get_current_user)):
    return UserOut.model_validate(current)


@api.get("/auth/oidc/start")
def auth_oidc_start(
    request: Request,
    next_path: str = Query(default="/dashboard", alias="next"),
    db: Session = Depends(get_db),
):
    settings = get_or_create_auth_settings(db)
    ensure_oidc_enabled(settings)
    oidc_logger.info(
        "OIDC start issuer=%s client_id=%s next=%s request_url=%s",
        settings.oidc_issuer_url,
        settings.oidc_client_id,
        next_path,
        str(request.url),
    )
    discovery = fetch_oidc_discovery(settings)
    safe_next = next_path
    state, cookie_value = create_oidc_state_cookie(safe_next)
    state_payload = decode_oidc_state_cookie(cookie_value)
    authorization_url = build_authorization_url(settings, discovery, request, state, state_payload["nonce"])
    response = RedirectResponse(url=authorization_url, status_code=status.HTTP_302_FOUND)
    _set_oidc_state_cookie(response, cookie_value)
    return response


@api.get("/auth/oidc/callback", name="auth_oidc_callback")
def auth_oidc_callback(
    request: Request,
    code: Optional[str] = None,
    state: Optional[str] = None,
    error: Optional[str] = None,
    error_description: Optional[str] = None,
    db: Session = Depends(get_db),
):
    settings = get_or_create_auth_settings(db)
    ensure_oidc_enabled(settings)
    if error:
        detail = error_description or error
        oidc_logger.error(
            "OIDC callback returned provider error issuer=%s error=%s error_description=%s state=%s iss_param=%s",
            settings.oidc_issuer_url,
            error,
            error_description,
            state,
            request.query_params.get("iss"),
        )
        raise HTTPException(status_code=400, detail=f"OIDC login failed: {detail}")
    if not code or not state:
        oidc_logger.error(
            "OIDC callback missing parameters issuer=%s state=%s has_code=%s query=%s",
            settings.oidc_issuer_url,
            state,
            bool(code),
            str(request.url.query),
        )
        raise HTTPException(status_code=400, detail="OIDC callback is missing required parameters")
    cookie_token = request.cookies.get(OIDC_STATE_COOKIE)
    if not cookie_token:
        oidc_logger.error(
            "OIDC callback missing session cookie issuer=%s state=%s request_url=%s cookies=%s",
            settings.oidc_issuer_url,
            state,
            str(request.url),
            sorted(request.cookies.keys()),
        )
        raise HTTPException(status_code=400, detail="OIDC login session is missing")
    state_payload = decode_oidc_state_cookie(cookie_token)
    if state_payload.get("state") != state:
        oidc_logger.error(
            "OIDC callback state mismatch issuer=%s expected_state=%s actual_state=%s request_url=%s",
            settings.oidc_issuer_url,
            state_payload.get("state"),
            state,
            str(request.url),
        )
        raise HTTPException(status_code=400, detail="OIDC state mismatch")

    discovery = fetch_oidc_discovery(settings)
    tokens = exchange_code_for_tokens(settings, discovery, code, request)
    id_claims = validate_id_token(settings, discovery, tokens["id_token"], state_payload["nonce"])
    userinfo = fetch_userinfo(discovery, tokens.get("access_token"))
    profile = resolve_oidc_profile(settings, id_claims, userinfo)
    user = resolve_or_create_oidc_user(db, settings, discovery, profile)

    token = create_access_token(user.id, user.email, user.role)
    redirect_url = frontend_redirect_url(request, state_payload.get("next", "/dashboard"))
    response = RedirectResponse(url=redirect_url, status_code=status.HTTP_302_FOUND)
    _set_auth_cookies(response, token)
    _set_auth_provider_cookie(response, OIDC_PROVIDER_TYPE)
    _clear_oidc_state_cookie(response)
    return response


# --------------- ROADMAPS ---------------
def _normalize_tags(raw: str) -> str:
    if not raw:
        return ""
    seen, out = set(), []
    for t in raw.split(","):
        t = t.strip().lower()
        if t and t not in seen:
            seen.add(t)
            out.append(t)
    return ",".join(out)


def _summary_from(r: Roadmap, block_count: int) -> RoadmapSummary:
    return RoadmapSummary(
        id=r.id, slug=r.slug, title=r.title, description=r.description,
        status=r.status, cover_emoji=r.cover_emoji,
        tags=r.tags or "", level=r.level or "mixed",
        block_count=int(block_count),
    )


def _dedupe_preserve_order(values: List[str]) -> List[str]:
    out: List[str] = []
    seen = set()
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        out.append(value)
    return out


def _json_bytes(payload: dict) -> bytes:
    return json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")


def _attachment_headers(filename: str) -> dict:
    return {
        "Content-Disposition": f'attachment; filename="{filename}"',
        "Cache-Control": "no-store",
    }


def _slugify_for_import(raw: str) -> str:
    base = (raw or "").strip().lower()
    if not base:
        base = "roadmap"
    base = re.sub(r"[^a-z0-9-]+", "-", base)
    base = re.sub(r"-{2,}", "-", base).strip("-")
    return base[:60] or "roadmap"


def _next_available_slug(base_slug: str, reserved_slugs: set[str]) -> str:
    candidate = base_slug
    if candidate not in reserved_slugs:
        reserved_slugs.add(candidate)
        return candidate
    index = 2
    while True:
        suffix = f"-{index}"
        trimmed = base_slug[: max(1, 60 - len(suffix))].rstrip("-")
        candidate = f"{trimmed}{suffix}"
        if candidate not in reserved_slugs:
            reserved_slugs.add(candidate)
            return candidate
        index += 1


def _assert_no_forbidden_import_keys(payload, source_name: str) -> None:
    if isinstance(payload, dict):
        for key, value in payload.items():
            if key in FORBIDDEN_IMPORT_KEYS:
                raise HTTPException(status_code=400, detail=f"{source_name}: forbidden key '{key}' in import payload")
            _assert_no_forbidden_import_keys(value, source_name)
    elif isinstance(payload, list):
        for entry in payload:
            _assert_no_forbidden_import_keys(entry, source_name)


def _parse_json_bytes(raw_bytes: bytes, source_name: str) -> dict:
    try:
        return json.loads(raw_bytes.decode("utf-8"))
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"{source_name}: file must be valid UTF-8 JSON") from exc
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail=f"{source_name}: invalid JSON ({exc.msg})") from exc


def _validate_import_envelope(raw_payload: dict, source_name: str) -> RoadmapExportEnvelope:
    _assert_no_forbidden_import_keys(raw_payload, source_name)
    try:
        envelope = RoadmapExportEnvelope.model_validate(raw_payload)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"{source_name}: invalid roadmap export payload") from exc
    if envelope.format != EXPORT_FORMAT:
        raise HTTPException(status_code=400, detail=f"{source_name}: unsupported export format '{envelope.format}'")
    if envelope.version != EXPORT_VERSION:
        raise HTTPException(status_code=400, detail=f"{source_name}: unsupported export version '{envelope.version}'")

    roadmap = envelope.roadmap
    if not ROADMAP_SLUG_RE.fullmatch(roadmap.slug):
        raise HTTPException(status_code=400, detail=f"{source_name}: invalid roadmap slug '{roadmap.slug}'")
    if not roadmap.title.strip():
        raise HTTPException(status_code=400, detail=f"{source_name}: roadmap title is required")
    if not roadmap.blocks:
        raise HTTPException(status_code=400, detail=f"{source_name}: roadmap must contain at least one block")

    seen_refs = set()
    for block in roadmap.blocks:
        if block.ref in seen_refs:
            raise HTTPException(status_code=400, detail=f"{source_name}: duplicate block ref '{block.ref}'")
        seen_refs.add(block.ref)
        if not block.title.strip():
            raise HTTPException(status_code=400, detail=f"{source_name}: each block must have a title")

    for link in roadmap.links:
        if link.from_ref not in seen_refs:
            raise HTTPException(status_code=400, detail=f"{source_name}: link references unknown from_ref '{link.from_ref}'")
        if link.to_ref not in seen_refs:
            raise HTTPException(status_code=400, detail=f"{source_name}: link references unknown to_ref '{link.to_ref}'")
    return envelope


def _read_import_bundle(file_name: str, content_type: str, raw_bytes: bytes) -> List[RoadmapExportEnvelope]:
    lower_name = (file_name or "").lower()
    normalized_type = (content_type or "").split(";")[0].strip().lower()
    if lower_name.endswith(".json") or normalized_type == "application/json":
        payload = _parse_json_bytes(raw_bytes, file_name or "import.json")
        return [_validate_import_envelope(payload, file_name or "import.json")]
    if lower_name.endswith(".zip") or normalized_type == "application/zip":
        try:
            archive = zipfile.ZipFile(io.BytesIO(raw_bytes))
        except zipfile.BadZipFile as exc:
            raise HTTPException(status_code=400, detail="Uploaded ZIP archive is invalid or corrupted") from exc

        names = archive.namelist()
        if "manifest.json" not in names:
            raise HTTPException(status_code=400, detail="ZIP import is missing manifest.json")
        manifest_payload = _parse_json_bytes(archive.read("manifest.json"), "manifest.json")
        _assert_no_forbidden_import_keys(manifest_payload, "manifest.json")
        try:
            manifest = RoadmapExportManifest.model_validate(manifest_payload)
        except Exception as exc:
            raise HTTPException(status_code=400, detail="manifest.json is invalid") from exc
        if manifest.format != EXPORT_FORMAT:
            raise HTTPException(status_code=400, detail=f"manifest.json: unsupported export format '{manifest.format}'")
        if manifest.version != EXPORT_VERSION:
            raise HTTPException(status_code=400, detail=f"manifest.json: unsupported export version '{manifest.version}'")
        if not manifest.roadmaps:
            raise HTTPException(status_code=400, detail="manifest.json must list at least one roadmap file")

        envelopes = []
        seen_files = set()
        for item in manifest.roadmaps:
            if item.file in seen_files:
                raise HTTPException(status_code=400, detail=f"manifest.json: duplicate file entry '{item.file}'")
            seen_files.add(item.file)
            if item.file not in names:
                raise HTTPException(status_code=400, detail=f"manifest.json: missing roadmap file '{item.file}'")
            if not item.file.startswith("roadmaps/") or not item.file.endswith(".json"):
                raise HTTPException(status_code=400, detail=f"manifest.json: invalid roadmap file path '{item.file}'")
            roadmap_payload = _parse_json_bytes(archive.read(item.file), item.file)
            envelope = _validate_import_envelope(roadmap_payload, item.file)
            if envelope.roadmap.slug != item.slug:
                raise HTTPException(status_code=400, detail=f"{item.file}: slug does not match manifest entry")
            envelopes.append(envelope)
        return envelopes
    raise HTTPException(status_code=400, detail="Import only supports .json and .zip files exported by Open Roadmap")


def _serialize_roadmap_export(
    roadmap: Roadmap,
    links: List[RoadmapLink],
    exported_at: datetime,
) -> RoadmapExportEnvelope:
    blocks = sorted(roadmap.blocks, key=lambda b: (b.order_index, b.id))
    block_refs = {block.id: f"block-{index:03d}" for index, block in enumerate(blocks, start=1)}
    block_order = {block.id: index for index, block in enumerate(blocks, start=1)}

    export_blocks = []
    for block in blocks:
        resources = sorted(block.resources, key=lambda res: (res.order_index, res.id))
        export_blocks.append(RoadmapExportBlock(
            ref=block_refs[block.id],
            title=block.title,
            short_description=block.short_description,
            detailed_content=block.detailed_content,
            level=block.level,
            estimated_duration=block.estimated_duration,
            order_index=block.order_index,
            x=block.x,
            y=block.y,
            width=block.width,
            height=block.height,
            node_style=block.node_style,
            kind=block.kind,
            bg_color=block.bg_color,
            label_position=block.label_position,
            label_align=block.label_align,
            resources=[
                RoadmapExportResource(
                    label=res.label,
                    url=res.url,
                    kind=res.kind,
                    order_index=res.order_index,
                )
                for res in resources
            ],
        ))

    ordered_links = sorted(
        links,
        key=lambda link: (
            block_order.get(link.from_block_id, 10**9),
            block_order.get(link.to_block_id, 10**9),
            link.created_at,
            link.id,
        ),
    )
    export_links = []
    skipped_links = 0
    for link in ordered_links:
        from_ref = block_refs.get(link.from_block_id)
        to_ref = block_refs.get(link.to_block_id)
        if from_ref is None or to_ref is None:
            skipped_links += 1
            logger.warning(
                "Skipping orphan roadmap link during export",
                extra={
                    "roadmap_id": roadmap.id,
                    "roadmap_slug": roadmap.slug,
                    "link_id": link.id,
                    "from_block_id": link.from_block_id,
                    "to_block_id": link.to_block_id,
                },
            )
            continue
        export_links.append(RoadmapExportLink(
            from_ref=from_ref,
            to_ref=to_ref,
            style=link.style,
            label=link.label,
            color=link.color,
            thickness=link.thickness,
            from_side=link.from_side,
            to_side=link.to_side,
        ))
    if skipped_links:
        logger.warning("Skipped %s orphan link(s) while exporting roadmap %s", skipped_links, roadmap.slug)

    return RoadmapExportEnvelope(
        format=EXPORT_FORMAT,
        version=EXPORT_VERSION,
        exported_at=exported_at,
        roadmap=RoadmapExportRoadmap(
            slug=roadmap.slug,
            title=roadmap.title,
            description=roadmap.description,
            status=roadmap.status,
            cover_emoji=roadmap.cover_emoji,
            tags=roadmap.tags or "",
            level=roadmap.level or "mixed",
            blocks=export_blocks,
            links=export_links,
        ),
    )


@api.get("/roadmaps", response_model=List[RoadmapSummary])
def list_roadmaps(
    q: Optional[str] = None,
    tag: Optional[str] = None,
    level: Optional[str] = None,
    db: Session = Depends(get_db),
):
    query = (
        db.query(Roadmap, func.count(RoadmapBlock.id).label("block_count"))
        .outerjoin(RoadmapBlock, RoadmapBlock.roadmap_id == Roadmap.id)
        .filter(Roadmap.status == "published")
    )
    if q:
        like = f"%{q.lower().strip()}%"
        query = query.filter(
            func.lower(Roadmap.title).like(like) | func.lower(Roadmap.description).like(like)
        )
    if tag:
        t = tag.strip().lower()
        # tags are comma-separated; match boundary to avoid "react" matching "react-native"
        query = query.filter(
            (func.lower(Roadmap.tags) == t)
            | func.lower(Roadmap.tags).like(f"{t},%")
            | func.lower(Roadmap.tags).like(f"%,{t},%")
            | func.lower(Roadmap.tags).like(f"%,{t}")
        )
    if level and level != "all":
        query = query.filter(Roadmap.level == level)
    rows = query.group_by(Roadmap.id).order_by(Roadmap.created_at.asc()).all()
    return [_summary_from(r, count) for r, count in rows]


@api.get("/tags", response_model=List[str])
def list_tags(db: Session = Depends(get_db)):
    rows = db.query(Roadmap.tags).filter(Roadmap.status == "published", Roadmap.tags != "").all()
    bag = set()
    for (raw,) in rows:
        for t in (raw or "").split(","):
            t = t.strip().lower()
            if t:
                bag.add(t)
    return sorted(bag)


@api.get("/roadmaps/{slug_or_id}", response_model=RoadmapDetail)
def get_roadmap(slug_or_id: str, db: Session = Depends(get_db)):
    roadmap = (
        db.query(Roadmap)
        .options(joinedload(Roadmap.blocks).joinedload(RoadmapBlock.resources))
        .filter((Roadmap.slug == slug_or_id) | (Roadmap.id == slug_or_id))
        .first()
    )
    if roadmap is None or roadmap.status != "published":
        raise HTTPException(status_code=404, detail="Roadmap not found")
    blocks = sorted(roadmap.blocks, key=lambda b: b.order_index)
    links = db.query(RoadmapLink).filter(RoadmapLink.roadmap_id == roadmap.id).all()
    return RoadmapDetail(
        id=roadmap.id, slug=roadmap.slug, title=roadmap.title,
        description=roadmap.description, status=roadmap.status,
        cover_emoji=roadmap.cover_emoji,
        tags=roadmap.tags or "", level=roadmap.level or "mixed",
        blocks=[BlockOut.model_validate(b) for b in blocks],
        links=[LinkOut.model_validate(l) for l in links],
    )


# --------------- CANVAS EDITOR (editor + admin only) ---------------
EDITOR_ROLES = ("admin", "editor")


@api.patch("/blocks/{block_id}/position", response_model=BlockOut)
def update_block_position(
    block_id: str,
    payload: BlockPositionIn,
    _: User = Depends(require_roles(*EDITOR_ROLES)),
    db: Session = Depends(get_db),
):
    block = db.query(RoadmapBlock).filter(RoadmapBlock.id == block_id).first()
    if block is None:
        raise HTTPException(status_code=404, detail="Block not found")
    block.x = payload.x
    block.y = payload.y
    if payload.width is not None:
        block.width = payload.width
    if payload.height is not None:
        block.height = payload.height
    db.commit()
    db.refresh(block)
    return BlockOut.model_validate(block)


@api.put("/blocks/{block_id}", response_model=BlockOut)
def update_block_details(
    block_id: str,
    payload: BlockUpsertIn,
    _: User = Depends(require_roles(*EDITOR_ROLES)),
    db: Session = Depends(get_db),
):
    block = db.query(RoadmapBlock).filter(RoadmapBlock.id == block_id).first()
    if block is None:
        raise HTTPException(status_code=404, detail="Block not found")
    for field in ("title", "short_description", "detailed_content", "level",
                  "estimated_duration", "node_style", "x", "y", "width", "height",
                  "kind", "bg_color", "label_position", "label_align"):
        setattr(block, field, getattr(payload, field))
    db.commit()
    db.refresh(block)
    return BlockOut.model_validate(block)


@api.post("/roadmaps/{roadmap_id}/blocks", response_model=BlockOut, status_code=201)
def create_block(
    roadmap_id: str,
    payload: BlockUpsertIn,
    _: User = Depends(require_roles(*EDITOR_ROLES)),
    db: Session = Depends(get_db),
):
    roadmap = db.query(Roadmap).filter(
        (Roadmap.id == roadmap_id) | (Roadmap.slug == roadmap_id)
    ).first()
    if roadmap is None:
        raise HTTPException(status_code=404, detail="Roadmap not found")
    max_order = db.query(func.max(RoadmapBlock.order_index)).filter(
        RoadmapBlock.roadmap_id == roadmap.id
    ).scalar()
    block = RoadmapBlock(
        roadmap_id=roadmap.id,
        title=payload.title,
        short_description=payload.short_description,
        detailed_content=payload.detailed_content,
        level=payload.level,
        estimated_duration=payload.estimated_duration,
        node_style=payload.node_style,
        x=payload.x, y=payload.y, width=payload.width, height=payload.height,
        kind=payload.kind, bg_color=payload.bg_color,
        label_position=payload.label_position, label_align=payload.label_align,
        order_index=(max_order or 0) + 1,
    )
    db.add(block)
    db.commit()
    db.refresh(block)
    return BlockOut.model_validate(block)


@api.delete("/blocks/{block_id}", status_code=204)
def delete_block(
    block_id: str,
    _: User = Depends(require_roles(*EDITOR_ROLES)),
    db: Session = Depends(get_db),
):
    block = db.query(RoadmapBlock).filter(RoadmapBlock.id == block_id).first()
    if block is None:
        raise HTTPException(status_code=404, detail="Block not found")
    db.query(RoadmapLink).filter(
        (RoadmapLink.from_block_id == block_id) | (RoadmapLink.to_block_id == block_id)
    ).delete(synchronize_session=False)
    db.delete(block)
    db.commit()
    return None


# --------------- BLOCK RESOURCES (editor + admin) ---------------
@api.post("/blocks/{block_id}/resources", response_model=ResourceOut, status_code=201)
def create_resource(
    block_id: str,
    payload: ResourceCreateIn,
    _: User = Depends(require_roles(*EDITOR_ROLES)),
    db: Session = Depends(get_db),
):
    block = db.query(RoadmapBlock).filter(RoadmapBlock.id == block_id).first()
    if block is None:
        raise HTTPException(status_code=404, detail="Block not found")
    max_order = db.query(func.max(BlockResource.order_index)).filter(
        BlockResource.block_id == block_id
    ).scalar()
    res = BlockResource(
        block_id=block_id,
        label=payload.label.strip(),
        url=payload.url.strip(),
        kind=payload.kind,
        order_index=(max_order or 0) + 1,
    )
    db.add(res)
    db.commit()
    db.refresh(res)
    return ResourceOut.model_validate(res)


@api.patch("/resources/{resource_id}", response_model=ResourceOut)
def update_resource(
    resource_id: str,
    payload: ResourceUpdateIn,
    _: User = Depends(require_roles(*EDITOR_ROLES)),
    db: Session = Depends(get_db),
):
    res = db.query(BlockResource).filter(BlockResource.id == resource_id).first()
    if res is None:
        raise HTTPException(status_code=404, detail="Resource not found")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        if isinstance(v, str):
            v = v.strip()
        setattr(res, k, v)
    db.commit()
    db.refresh(res)
    return ResourceOut.model_validate(res)


@api.patch("/blocks/{block_id}/resources/reorder", response_model=List[ResourceOut])
def reorder_resources(
    block_id: str,
    payload: ResourceReorderIn,
    _: User = Depends(require_roles(*EDITOR_ROLES)),
    db: Session = Depends(get_db),
):
    block = db.query(RoadmapBlock).filter(RoadmapBlock.id == block_id).first()
    if block is None:
        raise HTTPException(status_code=404, detail="Block not found")

    resources = (
        db.query(BlockResource)
        .filter(BlockResource.block_id == block_id)
        .order_by(BlockResource.order_index.asc(), BlockResource.id.asc())
        .all()
    )
    if not resources:
        raise HTTPException(status_code=400, detail="Block has no resources")

    current_ids = [res.id for res in resources]
    if len(payload.resource_ids) != len(current_ids):
        raise HTTPException(status_code=400, detail="Resource list length mismatch")
    if set(payload.resource_ids) != set(current_ids):
        raise HTTPException(status_code=400, detail="Resource list must match the block resources exactly")

    by_id = {res.id: res for res in resources}
    ordered = [by_id[resource_id] for resource_id in payload.resource_ids]
    for index, res in enumerate(ordered, start=1):
        res.order_index = index

    db.commit()
    for res in ordered:
        db.refresh(res)
    return [ResourceOut.model_validate(res) for res in ordered]


@api.delete("/resources/{resource_id}", status_code=204)
def delete_resource(
    resource_id: str,
    _: User = Depends(require_roles(*EDITOR_ROLES)),
    db: Session = Depends(get_db),
):
    res = db.query(BlockResource).filter(BlockResource.id == resource_id).first()
    if res is None:
        raise HTTPException(status_code=404, detail="Resource not found")
    db.delete(res)
    db.commit()
    return None


@api.post("/roadmaps/{roadmap_id}/links", response_model=LinkOut, status_code=201)
def create_link(
    roadmap_id: str,
    payload: LinkCreateIn,
    _: User = Depends(require_roles(*EDITOR_ROLES)),
    db: Session = Depends(get_db),
):
    roadmap = db.query(Roadmap).filter(
        (Roadmap.id == roadmap_id) | (Roadmap.slug == roadmap_id)
    ).first()
    if roadmap is None:
        raise HTTPException(status_code=404, detail="Roadmap not found")
    if payload.from_block_id == payload.to_block_id:
        raise HTTPException(status_code=400, detail="Cannot link a block to itself")
    for bid in (payload.from_block_id, payload.to_block_id):
        b = db.query(RoadmapBlock).filter(RoadmapBlock.id == bid).first()
        if b is None or b.roadmap_id != roadmap.id:
            raise HTTPException(status_code=400, detail="Block does not belong to roadmap")
    link = RoadmapLink(
        roadmap_id=roadmap.id,
        from_block_id=payload.from_block_id,
        to_block_id=payload.to_block_id,
        style=payload.style,
        label=payload.label,
        color=payload.color,
        thickness=payload.thickness,
        from_side=payload.from_side,
        to_side=payload.to_side,
    )
    db.add(link)
    db.commit()
    db.refresh(link)
    return LinkOut.model_validate(link)


@api.patch("/links/{link_id}", response_model=LinkOut)
def update_link(
    link_id: str,
    payload: "LinkUpdateIn",
    _: User = Depends(require_roles(*EDITOR_ROLES)),
    db: Session = Depends(get_db),
):
    link = db.query(RoadmapLink).filter(RoadmapLink.id == link_id).first()
    if link is None:
        raise HTTPException(status_code=404, detail="Link not found")
    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(link, k, v)
    db.commit()
    db.refresh(link)
    return LinkOut.model_validate(link)


@api.delete("/links/{link_id}", status_code=204)
def delete_link(
    link_id: str,
    _: User = Depends(require_roles(*EDITOR_ROLES)),
    db: Session = Depends(get_db),
):
    link = db.query(RoadmapLink).filter(RoadmapLink.id == link_id).first()
    if link is None:
        raise HTTPException(status_code=404, detail="Link not found")
    db.delete(link)
    db.commit()
    return None


# --------------- ROADMAP CRUD (editor + admin) ---------------
@api.get("/admin/roadmaps", response_model=List[RoadmapSummary])
def list_all_roadmaps(
    _: User = Depends(require_roles(*EDITOR_ROLES)),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(Roadmap, func.count(RoadmapBlock.id).label("block_count"))
        .outerjoin(RoadmapBlock, RoadmapBlock.roadmap_id == Roadmap.id)
        .group_by(Roadmap.id)
        .order_by(Roadmap.created_at.asc())
        .all()
    )
    return [_summary_from(r, count) for r, count in rows]


@api.post("/admin/roadmaps/export")
def export_roadmaps(
    payload: RoadmapExportRequest,
    _: User = Depends(require_roles(*EDITOR_ROLES)),
    db: Session = Depends(get_db),
):
    roadmap_ids = _dedupe_preserve_order(payload.roadmap_ids)
    if not roadmap_ids:
        raise HTTPException(status_code=400, detail="At least one roadmap must be selected")

    roadmaps = (
        db.query(Roadmap)
        .options(joinedload(Roadmap.blocks).joinedload(RoadmapBlock.resources))
        .filter(Roadmap.id.in_(roadmap_ids))
        .all()
    )
    roadmaps_by_id = {roadmap.id: roadmap for roadmap in roadmaps}
    missing_ids = [roadmap_id for roadmap_id in roadmap_ids if roadmap_id not in roadmaps_by_id]
    if missing_ids:
        raise HTTPException(status_code=404, detail=f"Roadmap not found: {missing_ids[0]}")

    links = db.query(RoadmapLink).filter(RoadmapLink.roadmap_id.in_(roadmap_ids)).all()
    links_by_roadmap = {}
    for link in links:
        links_by_roadmap.setdefault(link.roadmap_id, []).append(link)

    exported_at = datetime.now(timezone.utc)
    exports = [
        _serialize_roadmap_export(
            roadmaps_by_id[roadmap_id],
            links_by_roadmap.get(roadmap_id, []),
            exported_at,
        )
        for roadmap_id in roadmap_ids
    ]

    if len(exports) == 1:
        export_payload = exports[0].model_dump(mode="json")
        filename = f"{exports[0].roadmap.slug}.json"
        return Response(
            content=_json_bytes(export_payload),
            media_type="application/json",
            headers=_attachment_headers(filename),
        )

    manifest_items = [
        RoadmapExportManifestItem(
            slug=entry.roadmap.slug,
            title=entry.roadmap.title,
            status=entry.roadmap.status,
            file=f"roadmaps/{entry.roadmap.slug}.json",
        )
        for entry in exports
    ]
    manifest = RoadmapExportManifest(
        format=EXPORT_FORMAT,
        version=EXPORT_VERSION,
        exported_at=exported_at,
        roadmaps=manifest_items,
    )

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("manifest.json", _json_bytes(manifest.model_dump(mode="json")))
        for entry in exports:
            archive.writestr(
                f"roadmaps/{entry.roadmap.slug}.json",
                _json_bytes(entry.model_dump(mode="json")),
            )

    filename = f"open-roadmap-export-{exported_at.strftime('%Y%m%dT%H%M%SZ')}.zip"
    return Response(
        content=buffer.getvalue(),
        media_type="application/zip",
        headers=_attachment_headers(filename),
    )


@api.post("/admin/roadmaps/import", response_model=RoadmapImportResult)
async def import_roadmaps(
    file: UploadFile = File(...),
    _: User = Depends(require_roles(*EDITOR_ROLES)),
    db: Session = Depends(get_db),
):
    filename = file.filename or "import"
    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(status_code=400, detail="Imported file is empty")

    envelopes = _read_import_bundle(filename, file.content_type or "", raw_bytes)
    existing_slugs = {slug for (slug,) in db.query(Roadmap.slug).all()}
    results = []

    try:
        for envelope in envelopes:
            roadmap = envelope.roadmap
            base_slug = _slugify_for_import(roadmap.slug)
            final_slug = _next_available_slug(base_slug, existing_slugs)
            imported = Roadmap(
                slug=final_slug,
                title=roadmap.title.strip(),
                description=roadmap.description,
                cover_emoji=roadmap.cover_emoji,
                status="draft",
                tags=_normalize_tags(roadmap.tags),
                level=roadmap.level or "mixed",
            )
            db.add(imported)
            db.flush()

            block_id_by_ref = {}
            for block in sorted(roadmap.blocks, key=lambda entry: (entry.order_index, entry.ref)):
                imported_block = RoadmapBlock(
                    roadmap_id=imported.id,
                    title=block.title.strip(),
                    short_description=block.short_description,
                    detailed_content=block.detailed_content,
                    level=block.level,
                    estimated_duration=block.estimated_duration,
                    order_index=block.order_index,
                    x=block.x,
                    y=block.y,
                    width=block.width,
                    height=block.height,
                    node_style=block.node_style,
                    kind=block.kind,
                    bg_color=block.bg_color,
                    label_position=block.label_position,
                    label_align=block.label_align,
                )
                db.add(imported_block)
                db.flush()
                block_id_by_ref[block.ref] = imported_block.id

                for resource in sorted(block.resources, key=lambda entry: entry.order_index):
                    db.add(BlockResource(
                        block_id=imported_block.id,
                        label=resource.label.strip(),
                        url=resource.url.strip(),
                        kind=resource.kind,
                        order_index=resource.order_index,
                    ))

            for link in roadmap.links:
                db.add(RoadmapLink(
                    roadmap_id=imported.id,
                    from_block_id=block_id_by_ref[link.from_ref],
                    to_block_id=block_id_by_ref[link.to_ref],
                    style=link.style,
                    label=link.label,
                    color=link.color,
                    thickness=link.thickness,
                    from_side=link.from_side,
                    to_side=link.to_side,
                ))

            results.append(RoadmapImportItemOut(
                slug_source=roadmap.slug,
                slug_final=final_slug,
                title=roadmap.title,
                status="draft",
                block_count=len(roadmap.blocks),
                link_count=len(roadmap.links),
            ))
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        logger.exception("Roadmap import failed")
        raise HTTPException(status_code=500, detail="Roadmap import failed")

    return RoadmapImportResult(imported_count=len(results), roadmaps=results)


@api.post("/roadmaps", response_model=RoadmapSummary, status_code=201)
def create_roadmap(
    payload: RoadmapCreateIn,
    _: User = Depends(require_roles(*EDITOR_ROLES)),
    db: Session = Depends(get_db),
):
    if db.query(Roadmap).filter(Roadmap.slug == payload.slug).first():
        raise HTTPException(status_code=409, detail="Slug already in use")
    rm = Roadmap(
        slug=payload.slug, title=payload.title, description=payload.description,
        cover_emoji=payload.cover_emoji, status=payload.status,
        tags=_normalize_tags(payload.tags), level=payload.level,
    )
    db.add(rm); db.commit(); db.refresh(rm)
    return _summary_from(rm, 0)


@api.put("/roadmaps/{roadmap_id}", response_model=RoadmapSummary)
def update_roadmap(
    roadmap_id: str,
    payload: RoadmapUpdateIn,
    _: User = Depends(require_roles(*EDITOR_ROLES)),
    db: Session = Depends(get_db),
):
    rm = db.query(Roadmap).filter(Roadmap.id == roadmap_id).first()
    if rm is None:
        raise HTTPException(status_code=404, detail="Roadmap not found")
    data = payload.model_dump(exclude_unset=True)
    if "slug" in data and data["slug"] != rm.slug:
        if db.query(Roadmap).filter(Roadmap.slug == data["slug"]).first():
            raise HTTPException(status_code=409, detail="Slug already in use")
    if "tags" in data and data["tags"] is not None:
        data["tags"] = _normalize_tags(data["tags"])
    for k, v in data.items():
        setattr(rm, k, v)
    db.commit(); db.refresh(rm)
    block_count = db.query(func.count(RoadmapBlock.id)).filter(RoadmapBlock.roadmap_id == rm.id).scalar() or 0
    return _summary_from(rm, block_count)


@api.patch("/roadmaps/{roadmap_id}/status", response_model=RoadmapSummary)
def set_roadmap_status(
    roadmap_id: str,
    payload: RoadmapStatusIn,
    _: User = Depends(require_roles(*EDITOR_ROLES)),
    db: Session = Depends(get_db),
):
    rm = db.query(Roadmap).filter(Roadmap.id == roadmap_id).first()
    if rm is None:
        raise HTTPException(status_code=404, detail="Roadmap not found")
    rm.status = payload.status
    db.commit(); db.refresh(rm)
    block_count = db.query(func.count(RoadmapBlock.id)).filter(RoadmapBlock.roadmap_id == rm.id).scalar() or 0
    return _summary_from(rm, block_count)


@api.delete("/roadmaps/{roadmap_id}", status_code=204)
def delete_roadmap(
    roadmap_id: str,
    _: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    rm = db.query(Roadmap).filter(Roadmap.id == roadmap_id).first()
    if rm is None:
        raise HTTPException(status_code=404, detail="Roadmap not found")
    db.delete(rm); db.commit()
    return None


# --------------- ADMIN: USER MANAGEMENT (admin only) ---------------
@api.get("/admin/auth/settings", response_model=AuthSettingsOut)
def admin_get_auth_settings(
    _: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    settings = get_or_create_auth_settings(db)
    return auth_settings_to_dict(settings)


@api.put("/admin/auth/settings", response_model=AuthSettingsOut)
def admin_update_auth_settings(
    payload: AuthSettingsUpdateIn,
    _: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    settings = get_or_create_auth_settings(db)
    apply_auth_settings_update(settings, payload.model_dump())
    db.add(settings)
    db.commit()
    db.refresh(settings)
    return auth_settings_to_dict(settings)


@api.get("/admin/users", response_model=List[UserOut])
def admin_list_users(
    _: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    return [UserOut.model_validate(u) for u in db.query(User).order_by(User.created_at.asc()).all()]


@api.patch("/admin/users/{user_id}/role", response_model=UserOut)
def admin_set_user_role(
    user_id: str,
    payload: RoleUpdateIn,
    current: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    target = db.query(User).filter(User.id == user_id).first()
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == current.id and payload.role != "admin":
        raise HTTPException(status_code=400, detail="Admin cannot demote themselves")
    target.role = payload.role
    db.commit(); db.refresh(target)
    return UserOut.model_validate(target)


@api.delete("/admin/users/{user_id}", status_code=204)
def admin_delete_user(
    user_id: str,
    current: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db),
):
    if user_id == current.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    target = db.query(User).filter(User.id == user_id).first()
    if target is None:
        raise HTTPException(status_code=404, detail="User not found")
    db.delete(target); db.commit()
    return None



# --------------- PROGRESS ---------------
def _summarize(db: Session, user_id: str, roadmap_id: str) -> RoadmapProgressSummary:
    total = (
        db.query(func.count(RoadmapBlock.id))
        .filter(RoadmapBlock.roadmap_id == roadmap_id, RoadmapBlock.kind == "block")
        .scalar()
        or 0
    )
    items = (
        db.query(UserProgress)
        .join(RoadmapBlock, RoadmapBlock.id == UserProgress.block_id)
        .filter(
            UserProgress.user_id == user_id,
            UserProgress.roadmap_id == roadmap_id,
            RoadmapBlock.kind == "block",
        )
        .all()
    )
    completed = sum(1 for i in items if i.status == "completed")
    in_progress = sum(1 for i in items if i.status == "in_progress")
    percent = int(round((completed / total) * 100)) if total else 0
    return RoadmapProgressSummary(
        roadmap_id=roadmap_id,
        total_blocks=int(total),
        completed_blocks=completed,
        in_progress_blocks=in_progress,
        percent_complete=percent,
        items=[ProgressOut.model_validate(i) for i in items],
    )


@api.get("/progress/me/{roadmap_id}", response_model=RoadmapProgressSummary)
def my_progress_for_roadmap(
    roadmap_id: str,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    roadmap = db.query(Roadmap).filter((Roadmap.id == roadmap_id) | (Roadmap.slug == roadmap_id)).first()
    if roadmap is None:
        raise HTTPException(status_code=404, detail="Roadmap not found")
    return _summarize(db, current.id, roadmap.id)


@api.post("/progress", response_model=ProgressOut)
def upsert_progress(
    payload: ProgressUpsertIn,
    current: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    block = db.query(RoadmapBlock).filter(RoadmapBlock.id == payload.block_id).first()
    if block is None or block.roadmap_id != payload.roadmap_id:
        raise HTTPException(status_code=404, detail="Block not found in roadmap")
    if block.kind != "block":
        raise HTTPException(status_code=400, detail="Progress is only available for blocks")

    progress = (
        db.query(UserProgress)
        .filter(UserProgress.user_id == current.id, UserProgress.block_id == payload.block_id)
        .first()
    )
    now = datetime.now(timezone.utc)
    if progress is None:
        progress = UserProgress(
            user_id=current.id,
            roadmap_id=payload.roadmap_id,
            block_id=payload.block_id,
            status=payload.status,
            notes=payload.notes or "",
        )
        if payload.status == "in_progress":
            progress.started_at = now
        elif payload.status == "completed":
            progress.started_at = now
            progress.completed_at = now
        db.add(progress)
    else:
        if payload.status != progress.status:
            if payload.status == "in_progress" and progress.started_at is None:
                progress.started_at = now
            if payload.status == "completed":
                if progress.started_at is None:
                    progress.started_at = now
                progress.completed_at = now
            if payload.status == "not_started":
                progress.started_at = None
                progress.completed_at = None
        progress.status = payload.status
        if payload.notes is not None:
            progress.notes = payload.notes

    db.commit()
    db.refresh(progress)
    return ProgressOut.model_validate(progress)


@api.get("/")
def root():
    return {"service": "roadmap-platform", "status": "ok"}


app.include_router(api)

_CSRF_SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}
_CSRF_EXEMPT_PATHS = {"/api/auth/login", "/api/auth/register"}


@app.middleware("http")
async def csrf_protect(request: Request, call_next):
    if request.method in _CSRF_SAFE_METHODS or request.url.path in _CSRF_EXEMPT_PATHS:
        return await call_next(request)
    # If client uses Bearer auth, skip CSRF (no cookie to abuse). Cookie auth → enforce double-submit.
    if request.headers.get("authorization", "").lower().startswith("bearer "):
        return await call_next(request)
    cookie_token = request.cookies.get(CSRF_COOKIE)
    header_token = request.headers.get("x-csrf-token")
    if cookie_token and (not header_token or header_token != cookie_token):
        from fastapi.responses import JSONResponse
        return JSONResponse({"detail": "CSRF token missing or invalid"}, status_code=403)
    return await call_next(request)


_origins = [o.strip() for o in os.environ.get("CORS_ORIGINS", "").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins or ["*"],
    allow_credentials=bool(_origins),
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)
