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
class ResourceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    label: str
    url: str
    kind: str
    order_index: int


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
    resources: List[ResourceOut] = []


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
