"""FastAPI app: auth + roadmaps + progress (Phase 1)."""
from dotenv import load_dotenv
load_dotenv()

import os
import logging
from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from database import Base, engine, get_db
from models import Roadmap, RoadmapBlock, User, UserProgress
from auth import (
    create_access_token,
    get_current_user,
    hash_password,
    verify_password,
)
from schemas import (
    BlockOut,
    LoginIn,
    ProgressOut,
    ProgressUpsertIn,
    RegisterIn,
    RoadmapDetail,
    RoadmapProgressSummary,
    RoadmapSummary,
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


# --------------- AUTH ---------------
@api.post("/auth/register", response_model=TokenOut, status_code=201)
def register(payload: RegisterIn, db: Session = Depends(get_db)):
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
    return TokenOut(access_token=token, user=UserOut.model_validate(user))


@api.post("/auth/login", response_model=TokenOut)
def login(payload: LoginIn, db: Session = Depends(get_db)):
    email = payload.email.lower().strip()
    user = db.query(User).filter(User.email == email).first()
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(user.id, user.email, user.role)
    return TokenOut(access_token=token, user=UserOut.model_validate(user))


@api.post("/auth/logout")
def logout(current: User = Depends(get_current_user)):
    # Token is stateless; client must discard. Endpoint exists for symmetry.
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
    return RoadmapDetail(
        id=roadmap.id, slug=roadmap.slug, title=roadmap.title,
        description=roadmap.description, status=roadmap.status,
        cover_emoji=roadmap.cover_emoji,
        blocks=[BlockOut.model_validate(b) for b in blocks],
    )


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

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
