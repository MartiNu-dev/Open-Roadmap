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


class OidcAuthOptionOut(BaseModel):
    enabled: bool
    display_name: Optional[str] = None


class AuthOptionsOut(BaseModel):
    local_login_enabled: bool = True
    self_register_enabled: bool
    oidc: OidcAuthOptionOut


class AuthSettingsOut(BaseModel):
    self_register_enabled: bool
    oidc_enabled: bool
    editors_see_all_roadmaps: bool
    oidc_display_name: str
    oidc_issuer_url: str
    oidc_client_id: str
    oidc_scopes: str
    oidc_email_claim: str
    oidc_name_claim: str
    oidc_role_claim: str
    oidc_role_values_user: str
    oidc_role_values_editor: str
    oidc_role_values_admin: str
    has_client_secret: bool
    secret_source: Literal["database", "environment", "none"]
    configured: bool
    callback_url_override: Optional[str] = None
    callback_url_overridden: bool = False


class AuthSettingsUpdateIn(BaseModel):
    self_register_enabled: bool = True
    oidc_enabled: bool = False
    editors_see_all_roadmaps: Optional[bool] = None
    oidc_display_name: str = Field(default="Enterprise SSO", min_length=1, max_length=120)
    oidc_issuer_url: str = ""
    oidc_client_id: str = ""
    client_secret: Optional[str] = None
    oidc_scopes: str = "openid profile email"
    oidc_email_claim: str = "email"
    oidc_name_claim: str = "name"
    oidc_role_claim: str = "roles"
    oidc_role_values_user: str = "user"
    oidc_role_values_editor: str = "editor"
    oidc_role_values_admin: str = "admin"


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


class ResourceReorderIn(BaseModel):
    resource_ids: List[str] = Field(min_length=1)


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
    kind: str = "block"
    bg_color: str = "#0f172a"
    label_position: str = "bottom"
    label_align: str = "center"
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
    width: int = 220
    height: int = 44
    kind: Literal["block", "group"] = "block"
    bg_color: str = "#0f172a"
    label_position: Literal["top", "bottom"] = "bottom"
    label_align: Literal["left", "center", "right"] = "center"


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


class OidcRoleTagMappingIn(BaseModel):
    role_name: str = Field(min_length=1, max_length=200)
    tags: str = Field(min_length=1, max_length=1000)


class OidcRoleTagMappingOut(BaseModel):
    id: str
    role_name: str
    role_key: str
    tags: str


class RoadmapVisibilitySettingsOut(BaseModel):
    editors_see_all_roadmaps: bool
    mappings: List[OidcRoleTagMappingOut]


class RoadmapVisibilitySettingsUpdateIn(BaseModel):
    editors_see_all_roadmaps: bool = True
    mappings: List[OidcRoleTagMappingIn] = []


RoadmapLevel = Literal["beginner", "intermediate", "advanced", "mixed"]


class RoadmapCreateIn(BaseModel):
    slug: str = Field(min_length=2, max_length=60, pattern=r"^[a-z0-9-]+$")
    title: str = Field(min_length=1, max_length=120)
    description: str = ""
    cover_emoji: str = "🗺️"
    status: Literal["draft", "published", "archived"] = "draft"
    tags: str = ""  # comma-separated, normalized server-side
    level: RoadmapLevel = "mixed"


class RoadmapUpdateIn(BaseModel):
    slug: Optional[str] = Field(default=None, min_length=2, max_length=60, pattern=r"^[a-z0-9-]+$")
    title: Optional[str] = Field(default=None, min_length=1, max_length=120)
    description: Optional[str] = None
    cover_emoji: Optional[str] = None
    tags: Optional[str] = None
    level: Optional[RoadmapLevel] = None


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
    tags: str = ""
    level: str = "mixed"
    block_count: int = 0


class RoadmapDetail(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    slug: str
    title: str
    description: str
    status: str
    cover_emoji: str
    tags: str = ""
    level: str = "mixed"
    blocks: List[BlockOut]
    links: List[LinkOut] = []


class RoadmapExportRequest(BaseModel):
    roadmap_ids: List[str]


class RoadmapExportResource(BaseModel):
    model_config = ConfigDict(extra="forbid")
    label: str
    url: str
    kind: RES_KIND
    order_index: int


class RoadmapExportBlock(BaseModel):
    model_config = ConfigDict(extra="forbid")
    ref: str
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
    kind: str = "block"
    bg_color: str = "#0f172a"
    label_position: str = "bottom"
    label_align: str = "center"
    resources: List[RoadmapExportResource] = []


class RoadmapExportLink(BaseModel):
    model_config = ConfigDict(extra="forbid")
    from_ref: str
    to_ref: str
    style: str
    label: str = ""
    color: str = "#475569"
    thickness: str = "medium"
    from_side: str = "bottom"
    to_side: str = "top"


class RoadmapExportRoadmap(BaseModel):
    model_config = ConfigDict(extra="forbid")
    slug: str
    title: str
    description: str
    status: str
    cover_emoji: str
    tags: str = ""
    level: str = "mixed"
    blocks: List[RoadmapExportBlock]
    links: List[RoadmapExportLink] = []


class RoadmapExportEnvelope(BaseModel):
    model_config = ConfigDict(extra="forbid")
    format: str
    version: int
    exported_at: datetime
    roadmap: RoadmapExportRoadmap


class RoadmapExportManifestItem(BaseModel):
    model_config = ConfigDict(extra="forbid")
    slug: str
    title: str
    status: str
    file: str


class RoadmapExportManifest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    format: str
    version: int
    exported_at: datetime
    roadmaps: List[RoadmapExportManifestItem]


class RoadmapImportItemOut(BaseModel):
    slug_source: str
    slug_final: str
    title: str
    status: str
    block_count: int
    link_count: int


class RoadmapImportResult(BaseModel):
    imported_count: int
    roadmaps: List[RoadmapImportItemOut]


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
