"""SQLAlchemy models: User, Roadmap, RoadmapBlock, BlockResource, UserProgress."""
import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Text, Integer, DateTime, ForeignKey, UniqueConstraint, Index
)
from sqlalchemy.orm import relationship
from database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"
    id = Column(String, primary_key=True, default=_uuid)
    email = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False, default="user")  # admin | editor | user
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)

    progress = relationship("UserProgress", back_populates="user", cascade="all, delete-orphan")


class Roadmap(Base):
    __tablename__ = "roadmaps"
    id = Column(String, primary_key=True, default=_uuid)
    slug = Column(String, unique=True, nullable=False, index=True)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=False, default="")
    status = Column(String, nullable=False, default="published")  # draft | published | archived
    cover_emoji = Column(String, nullable=False, default="🗺️")
    tags = Column(Text, nullable=False, default="")  # comma-separated, lowercase
    level = Column(String, nullable=False, default="mixed")  # beginner|intermediate|advanced|mixed
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)

    blocks = relationship(
        "RoadmapBlock",
        back_populates="roadmap",
        cascade="all, delete-orphan",
        order_by="RoadmapBlock.order_index",
    )


class RoadmapBlock(Base):
    __tablename__ = "roadmap_blocks"
    id = Column(String, primary_key=True, default=_uuid)
    roadmap_id = Column(String, ForeignKey("roadmaps.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String, nullable=False)
    short_description = Column(String, nullable=False, default="")
    detailed_content = Column(Text, nullable=False, default="")
    level = Column(String, nullable=False, default="beginner")  # beginner | intermediate | advanced
    estimated_duration = Column(String, nullable=False, default="")
    order_index = Column(Integer, nullable=False, default=0)
    # Canvas layout
    x = Column(Integer, nullable=False, default=0)
    y = Column(Integer, nullable=False, default=0)
    width = Column(Integer, nullable=False, default=200)
    height = Column(Integer, nullable=False, default=64)
    node_style = Column(String, nullable=False, default="primary")  # primary | alternative | optional | label

    roadmap = relationship("Roadmap", back_populates="blocks")
    resources = relationship(
        "BlockResource",
        back_populates="block",
        cascade="all, delete-orphan",
        order_by="BlockResource.order_index",
    )

    __table_args__ = (
        Index("ix_block_roadmap_order", "roadmap_id", "order_index"),
    )


class BlockResource(Base):
    __tablename__ = "block_resources"
    id = Column(String, primary_key=True, default=_uuid)
    block_id = Column(String, ForeignKey("roadmap_blocks.id", ondelete="CASCADE"), nullable=False, index=True)
    label = Column(String, nullable=False)
    url = Column(String, nullable=False)
    kind = Column(String, nullable=False, default="article")  # article | video | docs | course
    order_index = Column(Integer, nullable=False, default=0)

    block = relationship("RoadmapBlock", back_populates="resources")


class UserProgress(Base):
    __tablename__ = "user_progress"
    id = Column(String, primary_key=True, default=_uuid)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    roadmap_id = Column(String, ForeignKey("roadmaps.id", ondelete="CASCADE"), nullable=False, index=True)
    block_id = Column(String, ForeignKey("roadmap_blocks.id", ondelete="CASCADE"), nullable=False, index=True)
    status = Column(String, nullable=False, default="not_started")  # not_started | in_progress | completed
    notes = Column(Text, nullable=False, default="")
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)

    user = relationship("User", back_populates="progress")

    __table_args__ = (
        UniqueConstraint("user_id", "block_id", name="uq_progress_user_block"),
    )


class RoadmapLink(Base):
    __tablename__ = "roadmap_links"
    id = Column(String, primary_key=True, default=_uuid)
    roadmap_id = Column(String, ForeignKey("roadmaps.id", ondelete="CASCADE"), nullable=False, index=True)
    from_block_id = Column(String, ForeignKey("roadmap_blocks.id", ondelete="CASCADE"), nullable=False)
    to_block_id = Column(String, ForeignKey("roadmap_blocks.id", ondelete="CASCADE"), nullable=False)
    style = Column(String, nullable=False, default="solid")  # solid | dashed | dotted
    label = Column(String, nullable=False, default="")
    color = Column(String, nullable=False, default="#475569")
    thickness = Column(String, nullable=False, default="medium")  # small | medium | large
    from_side = Column(String, nullable=False, default="bottom")  # top | right | bottom | left
    to_side = Column(String, nullable=False, default="top")
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)
