# MailHub — Email Marketing System

Central, multi-brand email & campaign platform for Inno Travel Tech.
Plan: [FINAL-PLAN.md](FINAL-PLAN.md) · Glossary (Bangla): [GLOSSARY.md](GLOSSARY.md)

## Folder structure
```
.
├── frontend/          Next.js dashboard (UI)        — built from Step 4
├── backend/           Express API + email worker    — built from Step 3
│     └── migrations/  SQL that creates DB tables
├── docker-compose.yml runs PostgreSQL (+ apps later)
├── .env.example       copy to .env, fill secrets    (never commit .env)
├── FINAL-PLAN.md      full plan
├── GLOSSARY.md        beginner terms (Bangla)
└── CLAUDE.md          instructions for Claude Code
```

## Data vs code (important)
- **Code** lives in these folders (`frontend/`, `backend/`).
- **Data** (contacts, campaigns) lives inside **PostgreSQL** (a Docker volume),
  not in these folders.

## How to run (local) — used from Step 2 onward
```bash
cp .env.example .env      # then edit .env with real values
docker compose up -d db   # start the database
```

## Status
**Phase 1 (MVP) — ✅ built & working locally** (backend + frontend).
Full detail + what's next: **[PROGRESS.md](PROGRESS.md)**.

## Build steps (Phase 1 — MVP) — all done ✅
1. Project skeleton
2. PostgreSQL + first tables
3. Express backend + DB connection
4. Contacts: add / view / CSV import
5. Amazon SES + test email
6. Campaign: broadcast with filter + unsubscribe
7. Bounce/complaint webhook + suppression + tracking
8. Frontend (Next.js dashboard) — Loops-style, connected to the API

## Run locally
```bash
docker compose up -d db          # PostgreSQL
cd backend  && npm run dev       # API  → http://localhost:4000
cd frontend && npm run dev       # UI   → http://localhost:3000
cd backend  && npm run prisma:studio   # view/edit data (own terminal; Ctrl+C to stop)
```
