"""SQLAlchemy models: User, Roadmap, RoadmapBlock, BlockResource, UserProgress."""
import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Text, Integer, DateTime, ForeignKey, UniqueConstraint, Index, Boolean
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
    password_hash = Column(String, nullable=True)
    role = Column(String, nullable=False, default="user")  # admin | editor | user
    oidc_roles = Column(Text, nullable=False, default="")
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)

    progress = relationship("UserProgress", back_populates="user", cascade="all, delete-orphan")
    external_identities = relationship("ExternalIdentity", back_populates="user", cascade="all, delete-orphan")


class AuthSettings(Base):
    __tablename__ = "auth_settings"
    id = Column(Integer, primary_key=True, default=1)
    self_register_enabled = Column(Boolean, nullable=False, default=True)
    oidc_enabled = Column(Boolean, nullable=False, default=False)
    editors_see_all_roadmaps = Column(Boolean, nullable=False, default=True)
    oidc_display_name = Column(String, nullable=False, default="Enterprise SSO")
    oidc_issuer_url = Column(String, nullable=False, default="")
    oidc_client_id = Column(String, nullable=False, default="")
    oidc_client_secret = Column(Text, nullable=True)
    oidc_scopes = Column(String, nullable=False, default="openid profile email")
    oidc_email_claim = Column(String, nullable=False, default="email")
    oidc_name_claim = Column(String, nullable=False, default="name")
    oidc_role_claim = Column(String, nullable=False, default="roles")
    oidc_role_values_user = Column(Text, nullable=False, default="user")
    oidc_role_values_editor = Column(Text, nullable=False, default="editor")
    oidc_role_values_admin = Column(Text, nullable=False, default="admin")
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)


class ExternalIdentity(Base):
    __tablename__ = "external_identities"
    id = Column(String, primary_key=True, default=_uuid)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    provider_type = Column(String, nullable=False, default="oidc")
    provider_key = Column(String, nullable=False)
    subject = Column(String, nullable=False)
    email_at_link = Column(String, nullable=False, default="")
    last_login_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)

    user = relationship("User", back_populates="external_identities")

    __table_args__ = (
        UniqueConstraint("provider_type", "provider_key", "subject", name="uq_external_identity_provider_subject"),
        Index("ix_external_identity_lookup", "provider_type", "provider_key", "subject"),
    )


class OidcRoleTagMapping(Base):
    __tablename__ = "oidc_role_tag_mappings"
    id = Column(String, primary_key=True, default=_uuid)
    role_name = Column(String, nullable=False)
    role_key = Column(String, nullable=False)
    tags = Column(Text, nullable=False, default="")
    created_at = Column(DateTime(timezone=True), default=_now, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now, nullable=False)

    __table_args__ = (
        UniqueConstraint("role_key", name="uq_oidc_role_tag_mappings_role_key"),
        Index("ix_oidc_role_tag_mappings_role_key", "role_key"),
    )


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
    width = Column(Integer, nullable=False, default=220)
    height = Column(Integer, nullable=False, default=44)
    node_style = Column(String, nullable=False, default="primary")  # primary | alternative | optional | label
    # Object kind + group-only visual props
    kind = Column(String, nullable=False, default="block")          # block | group
    bg_color = Column(String, nullable=False, default="#0f172a")    # group background (slate-900 by default)
    label_position = Column(String, nullable=False, default="bottom")  # top | bottom
    label_align = Column(String, nullable=False, default="center")     # left | center | right

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
