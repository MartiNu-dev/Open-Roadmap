"""Pydantic schemas for request/response bodies."""
from datetime import datetime
from typing import List, Optional, Literal
from pydantic import BaseModel, ConfigDict, EmailStr, Field

Role = Literal["admin", "editor", "user"]
ProgressStatus = Literal["not_started", "in_progress", "completed"]


# ---------- Auth ----------
class RegisterIn(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=100)
    password: str = Field(min_length=6, max_length=200)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    email: EmailStr
    name: str
    role: Role
    created_at: datetime


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------- Roadmaps ----------
RES_KIND = Literal["article", "video", "docs", "course"]


class ResourceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    label: str
    url: str
    kind: str
    order_index: int


class ResourceCreateIn(BaseModel):
    label: str = Field(min_length=1, max_length=200)
    url: str = Field(min_length=1, max_length=1000)
    kind: RES_KIND = "article"


class ResourceUpdateIn(BaseModel):
    label: Optional[str] = Field(default=None, min_length=1, max_length=200)
    url: Optional[str] = Field(default=None, min_length=1, max_length=1000)
    kind: Optional[RES_KIND] = None
    order_index: Optional[int] = None


class BlockOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    roadmap_id: str
    title: str
    short_description: str
    detailed_content: str
    level: str
    estimated_duration: str
    order_index: int
    x: int
    y: int
    width: int
    height: int
    node_style: str
    resources: List[ResourceOut] = []


class LinkOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    roadmap_id: str
    from_block_id: str
    to_block_id: str
    style: str
    label: str = ""
    color: str = "#475569"
    thickness: str = "medium"
    from_side: str = "bottom"
    to_side: str = "top"


class BlockPositionIn(BaseModel):
    x: int
    y: int
    width: Optional[int] = None
    height: Optional[int] = None


class BlockUpsertIn(BaseModel):
    title: str = Field(min_length=1, max_length=120)
    short_description: str = ""
    detailed_content: str = ""
    level: str = ""
    estimated_duration: str = ""
    node_style: str = "primary"
    x: int = 0
    y: int = 0
    width: int = 200
    height: int = 64


class LinkCreateIn(BaseModel):
    from_block_id: str
    to_block_id: str
    style: str = "solid"
    label: str = ""
    color: str = "#475569"
    thickness: str = "medium"
    from_side: str = "bottom"
    to_side: str = "top"


class LinkUpdateIn(BaseModel):
    style: Optional[str] = None
    label: Optional[str] = None
    color: Optional[str] = None
    thickness: Optional[str] = None
    from_side: Optional[str] = None
    to_side: Optional[str] = None


# ---------- Admin ----------
class RoleUpdateIn(BaseModel):
    role: Role


class RoadmapCreateIn(BaseModel):
    slug: str = Field(min_length=2, max_length=60, pattern=r"^[a-z0-9-]+$")
    title: str = Field(min_length=1, max_length=120)
    description: str = ""
    cover_emoji: str = "🗺️"
    status: Literal["draft", "published", "archived"] = "draft"


class RoadmapUpdateIn(BaseModel):
    slug: Optional[str] = Field(default=None, min_length=2, max_length=60, pattern=r"^[a-z0-9-]+$")
    title: Optional[str] = Field(default=None, min_length=1, max_length=120)
    description: Optional[str] = None
    cover_emoji: Optional[str] = None


class RoadmapStatusIn(BaseModel):
    status: Literal["draft", "published", "archived"]


class RoadmapSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    slug: str
    title: str
    description: str
    status: str
    cover_emoji: str
    block_count: int = 0


class RoadmapDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    slug: str
    title: str
    description: str
    status: str
    cover_emoji: str
    blocks: List[BlockOut]
    links: List[LinkOut] = []


# ---------- Progress ----------
class ProgressOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    user_id: str
    roadmap_id: str
    block_id: str
    status: ProgressStatus
    notes: str
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    updated_at: datetime


class ProgressUpsertIn(BaseModel):
    roadmap_id: str
    block_id: str
    status: ProgressStatus
    notes: Optional[str] = None


class RoadmapProgressSummary(BaseModel):
    roadmap_id: str
    total_blocks: int
    completed_blocks: int
    in_progress_blocks: int
    percent_complete: int
    items: List[ProgressOut]
