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

## Phase 7 — DONE (2026-02): Filter & search roadmaps by tag/level
- [x] Schema: `Roadmap.tags` (TEXT, comma-separated lowercase) + `Roadmap.level` (beginner|intermediate|advanced|mixed); idempotent SQLite migration
- [x] Backend: `GET /api/roadmaps?q=&tag=&level=` (case-insensitive title/description search; boundary-safe tag match; `level=all` sentinel); `GET /api/tags` (sorted unique tags from published roadmaps)
- [x] `_normalize_tags` server-side: lowercase, trim, dedupe, comma-join. `_summary_from` helper consolidates response building.
- [x] Seed backfill: frontend/backend keep `mixed`, devops set to `advanced`; tag bag populated.
- [x] Frontend `/roadmaps`: search input + level select + tag chip bag + Clear; empty state; level badge + tag preview on each card. 200ms debounced fetch.
- [x] Frontend `/admin/roadmaps`: per-row `MetaEditor` auto-saves tags+level (500ms); new-roadmap dialog has tags+level fields.
- [x] Tests: `/app/backend/tests/test_filter_search.py` (13 cases) + prior 17 cases → 30/30 backend + 9/9 frontend pass.

## Phase 6 — DONE (2026-02): Cookie+CSRF auth + Resources CRUD
- [x] Auth migrated from Bearer/localStorage to **httpOnly cookies + double-submit CSRF**
      Backend: `_set_auth_cookies` + `csrf_protect` middleware; login/register CSRF-exempt; Bearer still accepted for backward compat
      Frontend: `api.js` axios `withCredentials: true` + `X-CSRF-Token` interceptor; `AuthContext` no longer touches localStorage; page reload keeps session via cookie
- [x] CORS: `allow_credentials` toggles automatically when `CORS_ORIGINS` env is set (echoes origin)
- [x] **Resources CRUD inside block editor** (editor/admin only)
      Backend: `POST /api/blocks/{block_id}/resources`, `PATCH /api/resources/{id}`, `DELETE /api/resources/{id}`
      Schemas: `ResourceCreateIn`, `ResourceUpdateIn` (article|video|docs|course)
      Frontend: new `Resources` section in `BlockSidePanel` (canManage) with Add button, inline label/kind/url editing (500ms debounced auto-save), delete with confirm. Viewer mode unchanged.
- [x] Regression suite added: `/app/backend/tests/test_cookie_csrf_resources.py` (17 tests, all pass)

## Phase 5 — DONE (2026-02): Canvas UX round 2
- [x] Auto-save in block edit form (debounced 500ms; status text "Auto-saves as you type")
- [x] Double-click on empty canvas area creates a new block at the cursor position
- [x] Right-click on empty canvas area opens a context menu with "Add block here" — block created at click coords
- [x] Drag-then-click suppression: 100ms `suppressClickRef` window after a drag — clicking no longer opens the panel after moving a block
- [x] Anchor-side persistence: link records `from_side` and `to_side`; rendered SVG path now starts from the exact side handle the editor dragged from, and ends on the side the cursor was over
- [x] Click OR right-click on a link opens `LinkSidePanel` (Sheet)
- [x] Link panel exposes: label, style (solid/dashed/dotted), thickness (small/medium/large), color (preset swatches + native picker), from_side & to_side (selects). Auto-saves on change.
- [x] Backend: added `color`, `thickness`, `from_side`, `to_side` columns to `roadmap_links` with idempotent SQLite migration; LinkCreateIn / LinkUpdateIn / LinkOut extended

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
- [x] Admin user management UI (list users, change role, deactivate) — backend endpoints + page
- [x] Roadmap CRUD UI (editor + admin): create / edit / archive / publish
- [x] Block management UI (CRUD on blocks + resources, reorder)  *(resources CRUD shipped in Phase 6; block reorder still TBD if needed)*
P1
- [ ] User profile page (change name, password)
- [ ] Notes editor on progress entries
- [x] Filter/search roadmaps by tag/level *(Phase 7)*
P2
- [ ] Roadmap tagging system
- [ ] Public profile pages
- [ ] Streak / weekly progress widget on dashboard
- [ ] Refactor `RoadmapCanvas.jsx` into custom hooks (drag, path calc) and fix exhaustive-deps

## Personas
- **Learner (user)**: browses, tracks progression, never sees other users' data
- **Editor**: curates roadmaps and blocks
- **Admin**: manages users + everything an editor can do

## Test credentials
See `/app/memory/test_credentials.md`.
