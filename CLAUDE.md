# CLAUDE.md — Email Marketing System

Project instructions for Claude Code. Read this first in every new session.

## What this project is

A **self-hosted, multi-brand email marketing system** for the company
**Inno Travel Tech** (mother company). It sends product updates, bug fixes,
new features, and promotions to clients of several separate products/brands
(Innovate Solution, Tripgic, Tripmargin, and more in future).

Full plan: **[FINAL-PLAN.md](FINAL-PLAN.md)** — read it before doing design work.
Beginner glossary (Bangla): **[GLOSSARY.md](GLOSSARY.md)**.
Current build status + how to run: **[PROGRESS.md](PROGRESS.md)** — read this at the
start of a new session to know exactly what already works and what's next.

## Current status (read first)
**Phase 1 MVP is BUILT and working locally** — backend (Express + Prisma + PostgreSQL
in Docker) and frontend (Next.js) both run. Verified end-to-end (14/14 checks) and
real emails delivered via Amazon SES (personal dev account, sandbox).
Frontend is styled in a clean **Loops-style** look (left sidebar, soft violet accent,
light/dark). Details, exact "done vs next", and run commands are in **PROGRESS.md**.

**UI reference (liked):** the chosen look is concept **demo #1 (Loops style)** — use it
as the visual reference for new screens. Demo URLs are listed in **PROGRESS.md**
(§ Concept demos). When building filters/templates/analytics etc., match that look.

## Run locally (quick)
1. `docker compose up -d db`  (repo root — starts PostgreSQL)
2. `cd backend && npm run dev`   → API at http://localhost:4000
3. `cd frontend && npm run dev`  → UI at http://localhost:3000
- View data: `cd backend && npm run prisma:studio`
- Secrets live in `backend/.env` (SES keys, DATABASE_URL) — never commit `.env`.

## Communication with this user (IMPORTANT)

- The user is a **business owner, not a developer**. Explain in **simple Bangla**.
- Keep answers **short**. Short sentences. Use tables/bullets, not long paragraphs.
- Define every technical term the first time (they are learning).
- Give **one clear recommendation**, not many options, unless asked.
- The user checks and approves; Claude does the actual building and setup.

## Final tech stack (decided — do not change without asking)

| Layer              | Tech                                                       |
| ------------------ | ---------------------------------------------------------- |
| Frontend           | Next.js + shadcn/ui + Tailwind CSS                         |
| Backend            | Express (Node.js)                                          |
| Database           | PostgreSQL (self-hosted on the company Linux server)       |
| Queue              | pg-boss (runs inside PostgreSQL — no Redis)                |
| File/image storage | Cloudflare R2                                              |
| Email sending      | Amazon SES                                                 |
| Events             | SES → SNS → Webhook                                        |
| Deploy             | Docker (docker-compose) + nginx + SSL, on the Linux server |

- Everything runs on the company's **own Linux server** → near-zero extra cost.
- **No Supabase, no AWS RDS, no Redis** for now (noted as future options only).
- Auth/login must be **built ourselves** (no Supabase Auth).

### Recommended libraries / tooling (use these)
| Purpose | Library |
| ------- | ------- |
| Language (front + back) | **TypeScript** |
| DB access + migrations | **Prisma** (Prisma Studio to view data) |
| Input validation | **Zod** |
| Email templates → HTML | **React Email** |
| CSV import | **Papa Parse** |
| Frontend data fetching | **TanStack Query** |
| Code quality | **ESLint + Prettier** |
| SES sending | **@aws-sdk/client-sesv2 (AWS SDK v3)** |

## Working style with this user (IMPORTANT)
- Work **step by step**. At each step, clearly state: **what was done → where we are
  now → what is next**. Keep it short and in simple Bangla.
- **Always double-check** the work is correct before moving on; verify by running it.
- Always use the **current / latest** recommended approach and library versions
  (verify the latest version/API when installing a package).
- **Teach** as you go — explain each new tool/term simply (the user is learning).
- **Show it to the eye.** Whenever a step produces something visible, give a simple
  click-by-click guide so the user can SEE it themselves (browser URL, Prisma Studio,
  pgAdmin, Docker Desktop screen, or a command + expected output). Seeing the result
  helps the user understand and stay motivated.
- **Keep this file and FINAL-PLAN.md in sync:** when a *core decision* changes, update
  both — the rule here, the detail in FINAL-PLAN.md. Claude does this automatically;
  the user does not need to cross-check.

## Manual tasks the user handles (Claude cannot do these)
- Install **Docker Desktop** and **Node.js** on the computer/server.
- **AWS SES**: verify domain, request production access, create access keys.
- **DNS records** (SPF, DKIM, DMARC) in Cloudflare DNS.
- **Cloudflare R2**: create bucket + API keys.
- **GitHub**: create repo, push/pull access.
- **Server**: SSH access for deployment.
- Put real secret values in `.env` (never commit it).
Claude does all coding, config, migrations, docker-compose, nginx/SSL setup, and
guides the user through each manual task.

## MCP servers
- Not required now — Claude Code's built-in terminal + file tools are enough.
- Optional later: a **PostgreSQL MCP** (inspect data) or **GitHub MCP**. Suggest only
  if it clearly saves effort.

## Core architecture rules (must follow)

- **Multi-brand**: each brand = own domain, own client list, own reputation, own
  sender identity. Brands are isolated. One brand's problem never affects another.
- **One email = one contact, per brand** (no duplicates within a brand).
- Unsubscribe & suppression are **per brand**.
- Inside a brand, multiple **teams** (Product, Marketing, Support, Sales...) share
  the client list; separated by team/type/tag. Teams are not fixed — add as needed.
  (Now: Product team → new feature/bug fix/update; Marketing team → promotion.)
- Emails have a **Category** (Product updates · Marketing/Offers · Tips & Onboarding ·
  Transactional) — clients choose categories in the preference center. Finer **labels**
  (new feature, bug fix) are internal, for team organizing & reports only. New
  categories/labels must be addable later without rebuilding.
- **RBAC roles**: Org Admin → Brand Admin → Team Manager → Editor → Analyst/Viewer.
- **Approval workflow** before sending: Draft → Review → Approve → Send.

## Email deliverability rules (never break these)

- Only email people who **consented**. Never email purchased/unconsented lists.
- Every email needs an **unsubscribe link + one-click unsubscribe header (RFC 8058)**.
- Set up **SPF + DKIM + DMARC** per sending domain; warm up new domains.
- Keep **bounce < 5%**, **complaint < 0.1%**. Add **auto-pause** if thresholds spike.
- Separate **transactional vs marketing** (ideally separate subdomains).
- Handle bounces/complaints via SES→SNS webhook (verify SNS signature).
- **Exactly-once sending** (no double emails on retry/crash).
- Images in email = hosted on R2, embedded by link. Prefer download links over
  attachments (small important files only as real attachments).

## Volume (current)

- ~700–800 recipients per send; ~8,000–10,000 emails/month.
- Small volume → shared IP is fine, no dedicated IP needed.

## Build phases (see FINAL-PLAN.md §10 for detail)

1. **Phase 1 (MVP)** — one brand: sender identity, contacts + CSV import, one
   broadcast via SES with filter, unsubscribe + suppression, bounce/complaint
   webhook + auto-pause, exactly-once sending, basic open/click tracking.
2. **Phase 2** — multi-team + RBAC, approval workflow, template editor, filters +
   saved segments, scheduling + timezone, analytics dashboard.
3. **Phase 3** — multi-brand, preference center, automation/drip/triggered, A/B.
4. **Phase 4** — API auto-sync, list cleaning/sunset, monitoring, advanced deliverability.

## Deferred (do NOT build now)

- Group / cross-brand campaigns from the mother company (dedupe across brands).
- Group consent is **not** being collected now → future group sending will need
  fresh consent gathered at that time.

## Workflow notes

- Local dev → GitHub push (never commit `.env`/secrets) → pull on server →
  `docker-compose up` → run migrations → nginx + SSL.
- Claude handles setup (docker-compose, migrations, nginx, SSL, backups). The user
  does the familiar push/pull and checks the result.
- Always verify email flows in SES **sandbox** first; use
  `bounce@simulator.amazonses.com` to test suppression.
