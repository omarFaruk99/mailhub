# PROGRESS — where we are

_Last updated: 2026-07-16 · Read this first in a new session._

## ✅ Phase 1 (MVP) — BUILT & verified (local dev)

Backend and frontend both work. Verified end-to-end (14/14 automated checks) and
real emails delivered via Amazon SES.

### Backend — `backend/` (Express + TypeScript + Prisma 7 + PostgreSQL)
- **Brands**: create, list.
- **Contacts**: add, list, **CSV import** (Papa Parse). Rule enforced: one email = one
  contact per brand (unique `[brandId, email]`). Each contact has a **`type`**
  (`client` | `prospect` | `internal`) and optional **`company`** (external company
  name, for filtering; blank for internal/individuals).
- **Campaigns**: create (draft), list, **send/broadcast** with filter
  (plan/country/**company**/**contact type**), **exactly-once**
  (unique `[campaignId, contactId]`), recipients list.
  - **Audience by type:** send accepts `includeTypes` (which contact types receive it).
    Category defaults: **Marketing/Offers → client+prospect**; **Product updates → all
    (client+prospect+internal)**; **Tips / Transactional → client** (user can adjust via
    checkboxes). `internal` = our own colleagues; never in the default marketing audience.
- **Unsubscribe**: link + **one-click List-Unsubscribe header (RFC 8058)**; GET page + POST.
- **Suppression**: per-brand; unsubscribe/bounce/complaint excluded from sends.
- **SES sending**: `@aws-sdk/client-sesv2`, UTF-8, custom headers.
- **Webhook** `/webhooks/ses` (SNS): bounce/complaint → auto-suppress; SNS signature
  verify (`sns-validator`); dev bypass env `SNS_SKIP_VERIFY=true`.
- **Tracking**: open pixel `/track/open`, click redirect `/track/click` → sets
  `openedAt` / `clickedAt`.
- **Templates**: CRUD (`src/routes/templates.ts`) for saved email designs
  (`Template` model = name, subject, `category`, `html`, `isStarter`). Approach is
  **template + HTML** (everyone edits HTML directly; no fill-in-fields/drag-drop yet).
  **Ready-made starter designs** live in `src/data/starter-templates.ts` — served at
  `GET /starter-templates` and **auto-seeded into every new brand** (`seedStarterTemplates`,
  called on brand create). `{{name}}` **merge tag** is replaced per recipient at send
  time (HTML-escaped, in `campaigns.ts`).
- CORS enabled for the frontend.
- Key files: `src/index.ts`, `src/routes/{brands,campaigns,templates,email,tracking,webhooks}.ts`,
  `src/email/ses.ts`, `src/prisma.ts`, `prisma/schema.prisma`, `prisma.config.ts`.

### Frontend — `frontend/` (Next.js 16 + shadcn/ui + Tailwind v4 + TanStack Query)
- Screens: **Dashboard**, **Contacts** (add + CSV import; **type dropdown + company
  field**, type filter chips, type badge), **Templates** (list with **Starter/Yours**
  badge + a **⋯ actions menu** (Edit/Duplicate/Delete); editor is a full **page**
  `/templates/new` & `/templates/[id]` — HTML box + **live iframe preview** + "start from
  a ready-made design"), **Campaigns** (create is a full **page** `/campaigns/new`;
  **"Start from template"** prefills subject+body+category, with live preview),
  **Campaign detail / Send page** — **redesigned to a Loops-style 3-panel layout**
  (`/campaigns/[id]`): top action bar (breadcrumb + status + Send test + Send), a
  center **email preview canvas** (Desktop/Mobile toggle, live iframe of the campaign
  HTML), and a right **inspector** with collapsible **accordion** sections —
  **① Audience** (checkboxes Client/Prospect/Internal with live per-type counts),
  **② Filters** (plan + company dropdowns populated from the brand's contacts, shown
  as removable chips), **③ When to send** (Send now; Schedule = "Soon"),
  **④ Pre-send checklist**. Plus a persistent **recap** ("N people will receive
  this" + breakdown + **See exactly who** dialog), **Sender identity** (From /
  Reply-to), a **confirm dialog** before sending, and **after-send stats**
  (Sent/Opened/Clicked with %). The right inspector **collapses/expands** (a floating
  "Settings" button reopens it).
- Design: clean **Loops-style** — left sidebar (workspace switcher, search box, nav,
  user footer + theme toggle), soft **violet** accent, near-black buttons, light/dark.
  All colors/fonts are tokens in `src/app/globals.css` (change once → whole app).
- Talks to backend via `src/lib/api.ts` (`NEXT_PUBLIC_API_URL`). Single brand for now
  (`src/lib/use-brand.ts` uses the first brand).

### DB schema (Prisma models)
Brand, Contact (now with `type` + `company`), Campaign, CampaignRecipient,
Suppression. (Migrations in `backend/prisma/migrations/`.)

## Run locally
1. `docker compose up -d db`
2. `cd backend && npm run dev`   (http://localhost:4000)
3. `cd frontend && npm run dev`  (http://localhost:3000)
- Prisma Studio: `cd backend && npm run prisma:studio`
- New migration after schema change: `cd backend && npx prisma migrate dev --name x && npx prisma generate`

## Email / SES (dev)
Personal AWS, region **ap-southeast-1**, **sandbox**. Sender `no-reply@omarsec.com`
(DKIM verified via Cloudflare). Verified test recipients: `omarfaruk19952035@gmail.com`,
`shuvon19952035@gmail.com`. Full detail + DevOps setup guide: `_TEMP-email-notes.md`.

## How far we can go WITHOUT SES production access + deploy (read this)

**Owner's decision (strategy):** build **everything that is possible with personal
credentials** first (all features + self-testing on verified emails). Do **SES
production access + deploy LAST**, only at real launch when we must email actual
customers. Sequence every plan this way — feature work first, prod/deploy at the end.

Current setup = **personal AWS SES in sandbox** + local dev. That is enough to
**build and self-test everything** — do NOT block feature work waiting on prod/deploy.

**✅ Can do now with personal credentials (sandbox + local):**
- Build every feature (template editor, scheduling, analytics, approval, RBAC, etc.).
- Run the whole app locally and test end-to-end.
- Actually send emails — but **only to verified test recipients**
  (`omarfaruk19952035@gmail.com`, `shuvon19952035@gmail.com`).
- Contacts, campaigns, type/company filters, open/click tracking, unsubscribe — all testable.

**❌ Needs SES production access + deploy first (the wall):**
- Sending to **real, unverified** clients/prospects (that's why a non-verified address
  like `omar@example.com` shows **Failed** in sandbox).
- **Bulk / higher volume** sends.
- Team-wide live use (needs the app deployed on the company server).

**When to start #SES-production and #deploy:** only at real launch — i.e. when we need
to email **actual customers**. Until then keep building + self-testing on verified emails.
- **#SES production access**: apply in AWS (owner task; Claude guides) — takes days to
  approve, so start a bit before launch. Adds SPF/DMARC + custom MAIL FROM.
- **#Deploy**: docker-compose (backend+frontend) + nginx + SSL on the company Linux server.

## ▶️ Recommended next steps (in order)
All buildable + self-testable now with personal credentials (SES production + deploy
stay LAST, only at real launch — see the "Dev scope" section above).
1. **Scheduling** — send a campaign later (pick date/time, timezone).
2. **Analytics dashboard** — real open/click/bounce numbers + simple charts (no fake data).
3. **Saved segments + working global search** (contact `type`/`company` filters exist;
   save named segments + wire the sidebar search box).
4. **Teams + RBAC roles + approval workflow** (Draft→Review→Approve→Send) — one bigger
   chunk (approval needs roles).
5. **Multi-brand** (brand switcher) **+ preference center** (per-category opt-out).
6. **Template polish** — image **upload** button (needs Cloudflare R2 key) + a no-code
   editor (drag-and-drop / fill-in-fields) for non-coders.
7. **LAST, at launch:** SES **production access** (+ SPF/DMARC) and **deploy**
   (docker-compose + nginx + SSL on the company server).

## ⏭️ Not built yet — full backlog (Phase 2+)
- **Working global search** (sidebar box is visual only).
- **Saved segments** (contact `type`/`company` filter chips are done; saving a
  named segment + more filter fields still pending).
- **Dashboard widgets** to match the concept: engagement chart, deliverability card,
  sparkline stat tiles. (Only add real data — don't fake metrics.)
- **Template editor** ✅ done (template + HTML; ready-made starters auto-seeded;
  duplicate; Starter/Yours). Later: image **upload** button (R2), a no-code editor
  (drag-and-drop / fill-in-fields), per-team folders/brand kit.
- **Automations**, **Analytics** screen.
- **Teams + RBAC roles**, **approval workflow** (Draft→Review→Approve→Send).
- **Multi-brand** (brand switcher is single-brand now), **preference center**.
- **SES production access** + SPF/DMARC + custom MAIL FROM (better inbox placement).
- Deploy: docker-compose (add backend+frontend services) + nginx + SSL on Linux server.

## Design decision (locked)
UI follows the **Loops.so / Customer.io** style (clean left-sidebar dashboard). The
company wants to follow proven big-company UX patterns. Accent/font/spacing are easy
to tune later (tokens in `frontend/src/app/globals.css`).

### Concept demos (static mockups — reference for future screens)
Saved permanently in **`design/`** (open the .html in a browser). **Demo #1 (Loops)
is the chosen/liked direction** — match new screens to it.

- ⭐ **#1 Loops (CHOSEN)** → `design/1-loops-concept.html`
  · live: https://claude.ai/code/artifact/69b3581b-2b59-43e2-8eb6-2e3b45d8951e
- #2 Resend (dark, top-nav) → `design/2-resend-concept.html`
- #3 Customer.io/Loops (polished) → `design/3-customerio-loops-concept.html`

These demos show the **full app vision** (with static data) incl. screens not built
yet — dashboard chart/deliverability, audiences, templates, automations, analytics,
settings. Match new real screens to demo #1's look.
