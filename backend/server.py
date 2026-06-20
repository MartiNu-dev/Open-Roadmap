"""FastAPI app: auth + roadmaps + progress (Phase 1)."""
from dotenv import load_dotenv
load_dotenv()

import os
import secrets
import logging
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from database import Base, engine, get_db
from migrations import run_migrations
from models import Roadmap, RoadmapBlock, RoadmapLink, User, UserProgress
from auth import (
    create_access_token,
    get_current_user,
    hash_password,
    require_roles,
    verify_password,
)
from schemas import (
    BlockOut,
    BlockPositionIn,
    BlockUpsertIn,
    LinkCreateIn,
    LinkOut,
    LinkUpdateIn,
    LoginIn,
    ProgressOut,
    ProgressUpsertIn,
    RegisterIn,
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
        logger.info("Seed complete")
    except Exception:
        logger.exception("Seed failed")
        db.rollback()
    finally:
        db.close()


COOKIE_NAME = "access_token"
CSRF_COOKIE = "csrf_token"
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


# --------------- AUTH ---------------
@api.post("/auth/register", response_model=TokenOut, status_code=201)
def register(payload: RegisterIn, response: Response, db: Session = Depends(get_db)):
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
    return TokenOut(access_token=token, user=UserOut.model_validate(user))


@api.post("/auth/login", response_model=TokenOut)
def login(payload: LoginIn, response: Response, db: Session = Depends(get_db)):
    email = payload.email.lower().strip()
    user = db.query(User).filter(User.email == email).first()
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(user.id, user.email, user.role)
    _set_auth_cookies(response, token)
    return TokenOut(access_token=token, user=UserOut.model_validate(user))


@api.post("/auth/logout")
def logout(response: Response, current: User = Depends(get_current_user)):
    _clear_auth_cookies(response)
    return {"ok": True}


@api.get("/auth/me", response_model=UserOut)
def me(current: User = Depends(get_current_user)):
    return UserOut.model_validate(current)


# --------------- ROADMAPS ---------------
@api.get("/roadmaps", response_model=List[RoadmapSummary])
def list_roadmaps(db: Session = Depends(get_db)):
    rows = (
        db.query(
            Roadmap,
            func.count(RoadmapBlock.id).label("block_count"),
        )
        .outerjoin(RoadmapBlock, RoadmapBlock.roadmap_id == Roadmap.id)
        .filter(Roadmap.status == "published")
        .group_by(Roadmap.id)
        .order_by(Roadmap.created_at.asc())
        .all()
    )
    return [
        RoadmapSummary(
            id=r.id, slug=r.slug, title=r.title, description=r.description,
            status=r.status, cover_emoji=r.cover_emoji, block_count=int(count),
        )
        for r, count in rows
    ]


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
                  "estimated_duration", "node_style", "x", "y", "width", "height"):
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
    return [
        RoadmapSummary(
            id=r.id, slug=r.slug, title=r.title, description=r.description,
            status=r.status, cover_emoji=r.cover_emoji, block_count=int(count),
        )
        for r, count in rows
    ]


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
    )
    db.add(rm); db.commit(); db.refresh(rm)
    return RoadmapSummary(
        id=rm.id, slug=rm.slug, title=rm.title, description=rm.description,
        status=rm.status, cover_emoji=rm.cover_emoji, block_count=0,
    )


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
    for k, v in data.items():
        setattr(rm, k, v)
    db.commit(); db.refresh(rm)
    block_count = db.query(func.count(RoadmapBlock.id)).filter(RoadmapBlock.roadmap_id == rm.id).scalar() or 0
    return RoadmapSummary(
        id=rm.id, slug=rm.slug, title=rm.title, description=rm.description,
        status=rm.status, cover_emoji=rm.cover_emoji, block_count=int(block_count),
    )


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
    return RoadmapSummary(
        id=rm.id, slug=rm.slug, title=rm.title, description=rm.description,
        status=rm.status, cover_emoji=rm.cover_emoji, block_count=int(block_count),
    )


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
