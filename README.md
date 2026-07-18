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
```

## View / edit the data — Prisma Studio
Prisma Studio is a visual page to see and edit the database tables (like Excel
for your data). It's a **separate tool** — run it in its own terminal.

```bash
cd backend && npm run prisma:studio
```
- It opens in your browser. The terminal prints the exact address, e.g.
  `Prisma Studio is running at: http://localhost:5555` (the port can vary —
  read that line).
- Left side = tables (Brand, Contact, Campaign, Template, …). Click a table to
  see its rows; click a row to view/edit; "Add record" to insert.
- Backend and Prisma Studio both talk to the **same database** (via
  `backend/.env` → `DATABASE_URL`), so changes made in the app show up here on refresh.

**Stop Prisma Studio:** press `Ctrl + C` in that terminal.

> Note: the backend's own Prisma runs automatically inside `npm run dev` — you
> don't start it separately. Prisma Studio is only for *viewing/editing* data.
