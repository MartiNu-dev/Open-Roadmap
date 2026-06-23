"""FastAPI app: auth + roadmaps + progress (Phase 1)."""
from dotenv import load_dotenv
load_dotenv()

import os
import secrets
import logging
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Query, Request, Response, status
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
    total = db.query(func.count(RoadmapBlock.id)).filter(RoadmapBlock.roadmap_id == roadmap_id).scalar() or 0
    items = (
        db.query(UserProgress)
        .filter(UserProgress.user_id == user_id, UserProgress.roadmap_id == roadmap_id)
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
)
