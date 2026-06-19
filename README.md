# Roadmap Platform

A self-hosted, roadmap.sh-inspired learning platform: browse curated learning roadmaps composed of ordered blocks, track your progression per block, with role-based access (admin / editor / user). No AI features.

## Stack
- **Backend**: FastAPI + SQLAlchemy + SQLite + JWT (bcrypt-hashed passwords)
- **Frontend**: React 19 + Tailwind + shadcn/ui
- **Containerization**: Docker + docker-compose with a persistent SQLite volume

## Run with Docker

```bash
docker compose up --build
```

- Frontend: http://localhost:3000
- Backend:  http://localhost:8001 (API under `/api`)
- SQLite database is persisted in the named volume `sqlite_data`.

## Seeded accounts

| Role   | Email                | Password   |
|--------|----------------------|------------|
| admin  | admin@example.com    | admin123   |
| editor | editor@example.com   | editor123  |
| user   | user@example.com     | user123    |

The standard user is pre-seeded with sample progress on the **Frontend Developer** roadmap.

## Seeded content
- 3 roadmaps (Frontend, Backend, DevOps & Cloud)
- 11 ordered blocks per roadmap, each with 2 resources

## API (Phase 1)
- `POST /api/auth/register` · `POST /api/auth/login` · `POST /api/auth/logout` · `GET /api/auth/me`
- `GET  /api/roadmaps` · `GET /api/roadmaps/{slug_or_id}`
- `GET  /api/progress/me/{roadmap_id}` (auth) · `POST /api/progress` (auth)

## What's in Phase 1
- Local auth (register / login / logout / current user) with bcrypt + JWT
- Three roles in the DB schema (`admin`, `editor`, `user`); backend enforces authorization for every progress write
- Browse published roadmaps + roadmap detail with vertical timeline + side panel
- Per-user block progression (`not_started` / `in_progress` / `completed`) with progress bar
- Seed data (3 roadmaps × 11 blocks, 3 users, sample progress)
- Dockerfiles + docker-compose

## Deferred to Phase 2
- Admin user management UI
- Roadmap creation / editing UI (CRUD)
- Block management UI
- Editor publishing flow & roadmap archiving
- User profile editing
- Notes on progress entries (DB ready, no UI yet)
