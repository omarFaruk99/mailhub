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

**FINAL-PLAN.md vs PROGRESS.md — do not confuse these:**
- **FINAL-PLAN.md** = the full A-to-Z vision/roadmap — everything we will and won't
  build, and why, across all phases. Changes rarely.
- **PROGRESS.md** = "you are here" — only what's already ✅ done, and what's
  **immediately** next. Changes every session.
- A feature the user likes but wants done "later/at the end" goes into FINAL-PLAN.md
  (under its phase) — **not** into PROGRESS.md's next-up list. Only move it into
  PROGRESS.md when it actually becomes the immediate next task.

## Current status (read first)
**Phase 1 MVP is BUILT and working locally** — backend (Express + Prisma + PostgreSQL
in Docker) and frontend (Next.js) both run. Verified end-to-end (14/14 checks) and
real emails delivered via Amazon SES (personal dev account, sandbox).
Frontend is styled in a clean **Loops-style** look (left sidebar, soft violet accent,
light/dark). Details, exact "done vs next", and run commands are in **PROGRESS.md**.

**UI reference (liked):** the chosen look is concept **demo #1 (Loops style)** — use it
as the visual reference for new screens. Demo URLs are listed in **PROGRESS.md**
(§ Concept demos). When building filters/templates/analytics etc., match that look.

**Styling — use theme tokens, not hardcoded colors.** Colors/fonts are design tokens in
`frontend/src/app/globals.css` (change once → whole app; light/dark aware). Prefer the
token classes: `text-foreground` / `text-muted-foreground`, `bg-primary` /
`bg-background` / `bg-muted`, `border-input`, brand accent = **violet**, danger/required =
**`text-destructive`** (e.g. required-field `*`). Avoid hardcoded Tailwind colors like
`text-red-500`. Required fields: use `<Label required>…</Label>` (renders the `*`).

**Dev scope (owner's decision):** build **everything possible with personal credentials
first** (all features + self-test on verified emails), and do **SES production access +
deploy LAST**, only at real launch (emailing actual customers). Don't block feature work
on them; sequence plans feature-work-first, prod/deploy-at-the-end. Full details:
PROGRESS.md (§ "How far we can go WITHOUT SES production access + deploy").

## Run locally (quick)
1. `docker compose up -d db`  (repo root — starts PostgreSQL)
2. `cd backend && npm run dev`   → API at http://localhost:4000
3. `cd frontend && npm run dev`  → UI at http://localhost:3000
- View data: `cd backend && npm run prisma:studio`
- Secrets live in `backend/.env` (SES keys, DATABASE_URL) — never commit `.env`.
- **Daily work runs on the dev server** (`npm run dev`) — adding a feature/update does
  NOT need `npm run build`. Only build for a final sanity check or a real deploy.
- **NEVER run `npm run build` while `npm run dev` is running** — both use the same
  `.next` folder, so it corrupts the cache and throws a "Jest worker … exceeding retry
  limit" runtime error. If you must build, stop dev first, then build, then restart dev.
  (Fix if it happens: stop dev → `rm -rf frontend/.next` → `npm run dev`.)

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
| Email templates | **Plain HTML + ready-made starter designs** (template = HTML body; users edit HTML with a live preview). React Email was tried then removed — not used. A no-code editor (drag-and-drop) is a future option. |
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
- **Contact `type`**: `client` | `prospect` | `internal` (internal = our own
  colleagues). Optional **`company`** field = external company name, for filtering
  only (e.g. "send to ABC Travel's people"); blank for internal/individuals. It is a
  plain filter field — **not** a separate Company entity/hierarchy (that heavy version
  is intentionally out of scope). Internal contacts live inside each brand for now
  (`type=internal`); a shared org-level staff list is deferred to multi-brand (Phase 3).
- **Category → audience defaults** (sender can override with checkboxes at send time):
  Marketing/Offers → client + prospect · **Product updates → all (client + prospect +
  internal)** · Tips / Transactional → client. Rationale: staff/prospects should see
  new features (support needs to know them; a feature can convert a prospect).
  Internal is never in the default marketing audience.
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

- **Business decision (owner):** we email the owner-provided lists (clients,
  prospects, staff) **without a "consent gate"** — importing a contact = subscribed;
  there is NO pre-send opt-in/confirmation step. Deliverability is protected instead by
  unsubscribe + suppression + auto-pause (below), not by gating who we send to.
  (Best practice is consented lists only; this is an explicit owner override — keep the
  guardrails tight.)
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

- **Branching rule:** for a **big feature**, ALWAYS create a branch first
  (e.g. `claude/<feature-name>`), build & test there, then merge to `main` via PR once
  it works (so main never breaks; a bad attempt is just a deleted branch). Only
  **small changes** (typo, doc, one-line fix) go straight to `main`.
- Local dev → GitHub push (never commit `.env`/secrets) → pull on server →
  `docker-compose up` → run migrations → nginx + SSL.
- Claude handles setup (docker-compose, migrations, nginx, SSL, backups). The user
  does the familiar push/pull and checks the result.
- Always verify email flows in SES **sandbox** first; use
  `bounce@simulator.amazonses.com` to test suppression.
