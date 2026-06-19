# Product Requirements — Roadmap Platform

## Original problem statement
Containerized web application inspired by roadmap.sh (no AI features). Users browse learning roadmaps composed of ordered blocks. Each roadmap has title, description, status, ordered blocks. Each block has title, short description, detailed content, level, duration, order index, resources. Block clicks open a right-side panel (mobile: full-screen). Local email/password auth. Three roles: admin, editor, user. Per-user progression per block (not_started / in_progress / completed) with optional notes, started_at, completed_at. Progress bar with completed/total/percent. Pages: home, roadmap list, roadmap detail, login, register, dashboard, profile, admin user mgmt, roadmap create/edit, block management. Relational DB. Docker + docker-compose with persistent volume, migrations, seed data.

## User choices
- Database: **SQLite**
- Docker setup: dual (supervisor for preview, Docker for local) — accepted
- Phase 1 scope: auth + browse + progression
- Design: clean like roadmap.sh

## Architecture (Phase 1)
- Backend: FastAPI + SQLAlchemy 2.0 + SQLite, JWT (bcrypt), seeded data on startup
- Frontend: React 19 + Tailwind + shadcn/ui, auth via Bearer token in localStorage
- Schema: User, Roadmap, RoadmapBlock, BlockResource, UserProgress (unique on user_id+block_id)
- Auth: Bearer JWT (7 day expiry) + dependency-injected `get_current_user`, `require_roles(...)`

## Phase 4 — DONE (2026-02): Canvas UX polish
- [x] Drag-vs-click: dragging a block no longer opens its side panel (4px movement threshold + 50ms suppression window after mouseup)
- [x] Canvas auto-expands to fit content (removed `maxHeight` cap)
- [x] "Add block" is silent: instantly creates a block titled "Block" with empty level (no prompt)
- [x] `level` is now optional (empty string allowed) — backend default changed to ""
- [x] Crown emoji 👑 in top-left of each block when level is set; colored per level: yellow=beginner, slate=intermediate, amber=advanced
- [x] Anchor-drag link creation: hovering a block in edit mode reveals 4 blue circles (top/right/bottom/left); mousedown on one + mouseup over another block creates the link (replaces previous click-source / click-target flow)
- [x] Link properties: backend `RoadmapLink.label` column + migration; PATCH /api/links/{id} for {label, style}; label rendered mid-line in a rounded white pill; small blue dot at link midpoint opens edit prompt
- [ ] Deferred to next round: link color picker + thickness picker (label + dashed/solid shipped now)

## Phase 3 — DONE (2026-02): Admin User Management + Roadmap CRUD
- [x] Backend admin user mgmt: `GET /api/admin/users`, `PATCH /api/admin/users/{id}/role`, `DELETE /api/admin/users/{id}` (admin-only)
- [x] Self-protection: admin cannot demote or delete themselves (400)
- [x] Backend roadmap CRUD: `GET /api/admin/roadmaps` (editor/admin, includes drafts/archived), `POST /api/roadmaps`, `PUT /api/roadmaps/{id}`, `PATCH /api/roadmaps/{id}/status` (editor/admin), `DELETE /api/roadmaps/{id}` (admin-only)
- [x] Slug validation: regex `^[a-z0-9-]+$`, uniqueness enforced (409)
- [x] Status workflow: draft/archived roadmaps hidden from public GET /api/roadmaps; published visible
- [x] Frontend `/admin/users` (admin-only) with role select + delete, self-row disabled
- [x] Frontend `/admin/roadmaps` (editor+admin): list with status badges, create via Dialog, change status via select, delete (admin only)
- [x] Navbar shows conditional links: "Manage roadmaps" (editor/admin), "Users" (admin only)

## Phase 2 — DONE (2026-02): 2D Canvas Editor + Viewer
- [x] Schema: `RoadmapBlock` extended with x/y/width/height/node_style; new `RoadmapLink` table
- [x] Lightweight SQLite migration (`/app/backend/migrations.py`) — adds columns to existing DB on startup
- [x] Auto layout backfill: zigzag positioning (3 columns) + sequential links for every roadmap that lacks them
- [x] Canvas endpoints (admin/editor only via `require_roles`):
      `PATCH /api/blocks/{id}/position`, `PUT /api/blocks/{id}`,
      `POST /api/roadmaps/{id}/blocks`, `DELETE /api/blocks/{id}`,
      `POST /api/roadmaps/{id}/links`, `DELETE /api/links/{id}`
- [x] Validation: self-links and cross-roadmap links rejected with 400
- [x] Frontend `RoadmapCanvas.jsx`: dotted grid background, curved SVG link layer, absolutely positioned cards
- [x] Drag-to-reposition blocks in editor mode (persisted via PATCH)
- [x] Link-creation flow (pick source → pick target) and one-click link delete (× on path midpoint)
- [x] Edit form inside side panel: title, short description, detailed content, level, duration, block style (primary/alternative/optional/label)
- [x] Add block + delete block from editor toolbar / side panel
- [x] Status overlay per block in viewer mode (green check / blue spinner)
- [x] Role gating: edit toggle is only visible to admin/editor

## Phase 1 — DONE (2026-02)
- [x] DB models (User, Roadmap, RoadmapBlock, BlockResource, UserProgress)
- [x] Auth: register/login/logout/me, bcrypt + JWT, role field
- [x] Roadmap list + detail endpoints
- [x] Progress: GET summary per roadmap, POST upsert (authorization scoped to current user only)
- [x] Seed: 3 users (admin/editor/user), 3 roadmaps × 11 blocks × 2 resources, sample progress
- [x] Frontend pages: Home, RoadmapList, RoadmapDetail (with side panel), Login, Register, Dashboard
- [x] Vertical timeline with status dots (gray / blue / green) + progress bar
- [x] Dockerfiles + docker-compose.yml with persistent sqlite_data volume

## Phase 2 — Backlog
P0
- [ ] Admin user management UI (list users, change role, deactivate) — backend endpoints + page
- [ ] Roadmap CRUD UI (editor + admin): create / edit / archive / publish
- [ ] Block management UI (CRUD on blocks + resources, reorder)
P1
- [ ] User profile page (change name, password)
- [ ] Notes editor on progress entries
- [ ] Filter/search roadmaps by tag/level
P2
- [ ] Roadmap tagging system
- [ ] Public profile pages
- [ ] Streak / weekly progress widget on dashboard

## Personas
- **Learner (user)**: browses, tracks progression, never sees other users' data
- **Editor**: curates roadmaps and blocks
- **Admin**: manages users + everything an editor can do

## Test credentials
See `/app/memory/test_credentials.md`.
