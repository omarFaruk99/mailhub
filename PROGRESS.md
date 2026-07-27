# PROGRESS — where we are

_Last updated: 2026-07-28 · Read this first in a new session._

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
- **Scheduling (send later)**: `POST /campaigns/:id/schedule` + `/unschedule`, run by
  **pg-boss** (`src/queue.ts`, queue `campaign-send`) — jobs live in our own PostgreSQL
  (`pgboss` schema), so a scheduled send survives a server restart.
  - The send loop moved to `src/email/send-campaign.ts` so "Send now" and the worker
    run **the exact same code**.
  - `Campaign` gained `scheduledAt` (UTC instant) · `timezone` (IANA, for display) ·
    `sendOptions` (audience+filters frozen at schedule time) · `jobId`.
    Status is now `draft | scheduled | sending | sent | failed`
    (`failed` = the send ran but **nothing** was delivered — never a green "Sent").
  - **`Campaign.jobId` is the single source of truth** for which job may send a
    campaign: the worker only proceeds when the firing job's id still matches. A
    superseded job whose cancel failed is therefore powerless (pg-boss's default
    `standard` policy does **not** deduplicate by `singletonKey` — don't rely on it).
  - On startup, a campaign left at `sending` by a crash is reset — to `scheduled` if
    its job is still queued, otherwise to `draft`. Assumes one backend process.
  - Wall-clock → UTC conversion is `src/lib/timezone.ts` (built-in `Intl`, DST-safe,
    no date library).
  - The worker **claims** the campaign with one conditional UPDATE, so cancelling at
    the moment it fires either wins cleanly or is refused ("too late to cancel"). A
    crashed mid-send is picked up again on retry; duplicate emails are still
    impossible (unique recipient row per campaign+contact).
  - Known gap: no "Retry failed" for a send that gave up — after the last retry the
    campaign goes back to **draft** (visibly not sent) rather than sitting on a
    schedule that will never fire.
- **Analytics**: `GET /brands/:brandId/analytics?days=N` (`src/routes/analytics.ts`) —
  windowed totals + open/click rates, a zero-filled **daily series** for the last N days
  (UTC buckets), all-time **deliverability** (bounce/complaint/unsubscribe), and
  **per-campaign** performance. A rate is `null` (never 0) when there is nothing to
  divide by, so the UI shows "—" instead of fake data.
  - **Two scopes, on purpose:** engagement is a **cohort window** (an email counts on
    its send day; its later open/click counts against that same day, so a rate can
    never exceed 100%). **Deliverability is all-time** — `Suppression` is a *state*
    table (one row per address, upserted in place), not an event log, so it cannot be
    sliced by date. A true rolling bounce/complaint rate needs a per-event table →
    do it with **SES production access** (see FINAL-PLAN.md §6).
  - Open/click tracking records the **first** event only, so past days never change.
  - `webhooks.ts` only **escalates** a suppression reason (complaint > bounce >
    unsubscribe), never downgrades — a bounce can't be erased by a later event.
- CORS enabled for the frontend.
- Key files: `src/index.ts`, `src/routes/{brands,campaigns,templates,email,tracking,webhooks,analytics}.ts`,
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
  (Sent/Opened/Clicked with % of successfully-sent). After a send the center canvas
  switches to a **per-recipient results table** (email · status · opened · clicked)
  with a **Recipients ⇄ Email** toggle to flip back to the sent email. Re-sending is
  allowed after a send — the button reads "Send to N more" and the backend's
  exactly-once rule skips anyone who already got it. The right inspector
  **collapses/expands** (a floating "Settings" button reopens it). A `--good` success
  color token was added to `globals.css` (used for sent/opened/clicked accents).
- **Send page → ③ When to send** is now live: **Send now** or **Schedule for later**
  (date+time + full IANA timezone list, default = the browser's). A scheduled campaign
  shows a **Scheduled** pill, the chosen time, **Cancel schedule**, and **Update
  schedule**; the page polls every 15s while scheduled/sending so it updates itself
  when the send actually goes out. The Campaigns list has a **Scheduled for** column.
  - The audience/filters shown come from `Campaign.sendOptions` whenever it exists —
    **including after "Cancel schedule"**. Cancelling cancels the *time*, not the
    choice of who receives it; falling back to the category default there silently
    swapped a hand-picked audience (fixed 2026-07-28, reported from real use).
  - (③ used to read "Send now; Schedule = Soon" — that is done now.)
- **Analytics** (`/analytics`, in the sidebar): range chips (7/30/90 days), four stat
  tiles (Emails sent · Open rate · Click rate · Bounce rate), an **Engagement** line
  chart (sent/opened/clicked per day, hover crosshair + tooltip), a **Deliverability**
  card (bounce vs 5% · complaint vs 0.1% · unsubscribe, each with an icon + word so
  status is never colour-alone), and a **Campaign performance** DataTable. The
  **Dashboard** now shows the same real metrics + the 30-day chart.
  - Chart is a small dependency-free SVG component (`components/charts/line-chart.tsx`) —
    no chart library added. Series colours are new `--series-1/2/3` tokens in
    `globals.css` (blue/orange/aqua, re-stepped for dark), validated for
    colour-blind separation against the card surface.
- Design: clean **Loops-style** — left sidebar (workspace switcher, search box, nav,
  user footer + theme toggle), soft **violet** accent, near-black buttons, light/dark.
  All colors/fonts are tokens in `src/app/globals.css` (change once → whole app).
- Talks to backend via `src/lib/api.ts` (`NEXT_PUBLIC_API_URL`). Single brand for now
  (`src/lib/use-brand.ts` uses the first brand).

### DB schema (Prisma models)
Brand, Contact (now with `type` + `company`), Campaign (now with the scheduling
fields), CampaignRecipient, Suppression, Template.
(Migrations in `backend/prisma/migrations/`.)

### Defaults the system applies (know these before changing behaviour)
| Where | Default |
| ----- | ------- |
| New contact | `type=client`, `status=subscribed` (import = subscribed; no consent gate — owner's decision) |
| CSV import | blank type → `client`; an **unrecognised** type is still imported as `client` but returned in `unknownTypes` and shown as a warning toast — never silently coerced |
| CSV duplicate email | skipped (one email = one contact per brand) |
| Category → audience | Product updates → client+prospect+internal · Marketing/Offers → client+prospect · Tips/Transactional → client |
| New brand | 3 starter templates seeded |
| New campaign | `status=draft` |
| Merge tag | `{{name}}` with no name → "there" |
| Every email | unsubscribe link + RFC 8058 header + open/click tracking auto-appended |
| Schedule picker | now + 1 hour, browser timezone, minimum 2 minutes out |
| Scheduled job | 2 retries, 1-hour expiry, 10s poll |
| Send pacing | 200ms between emails (~5/sec) |
| Analytics | 30-day range; warn at bounce 5%, complaint 0.1% |

**Category → audience is a PRE-CHECK, not a lock** — the sender can change it, and
the confirm dialog shows the chosen audience + recipient count before sending.
The rule is written **twice**: `defaultTypesForCategory` (backend, authoritative)
and `defaultTypes` (frontend, mirrors it for the checkboxes). **Change both or
neither** — the backend applies it whenever the request omits `includeTypes`.

**Decision (2026-07-28): keep the pre-check.** Big tools (Mailchimp/Brevo/Klaviyo)
pre-select nothing, but they serve hundreds of lists and new staff daily; here the
rule *is* company policy, volume is 2–3 sends/week, and the confirm dialog already
forces a look. **Revisit when Teams + RBAC land** — an Editor who doesn't know the
policy is the case that changes the answer (likeliest change then: stop
pre-checking `internal`). Changing it later is cheap: two 5-line functions, no
migration, and already-scheduled sends are unaffected because their audience is
frozen in `Campaign.sendOptions`.

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
  (`omarfaruk19952035@gmail.com`, `shuvon19952035@gmail.com`), plus SES's own
  **simulator** address `success@simulator.amazonses.com`, which sandbox always
  accepts — handy for testing a real successful send without emailing a person.
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
0. ~~**Analytics dashboard**~~ ✅ **DONE** · ~~**Scheduling**~~ ✅ **DONE**
   (PRs #7–#11; branches `claude/analytics-dashboard`, `claude/scheduling*`).
1. **Auto-pause (circuit breaker)** — stop sending when bounce/complaint spikes.
   Small, and **mandatory before production**. It is the one guardrail big tools
   have that we don't, and the no-consent-gate decision makes it load-bearing.
2. **Saved segments + working global search** (contact `type`/`company` filters exist;
   save named segments + wire the sidebar search box).
3. **Teams + RBAC roles + approval workflow** (Draft→Review→Approve→Send) — one bigger
   chunk (approval needs roles). **Revisit the category→audience pre-check here.**
4. **Template polish** — image **upload** button (needs Cloudflare R2 key) + a no-code
   editor (drag-and-drop / fill-in-fields) for non-coders.
5. **Multi-brand** (brand switcher) **+ preference center** (per-category opt-out).
6. **LAST, at launch:** SES **production access** (+ SPF/DMARC) and **deploy**
   (docker-compose + nginx + SSL on the company server). Do the **`EmailEvent`
   table** in the same round (see FINAL-PLAN.md §6) — it unlocks rolling
   bounce/complaint rates, unique vs total opens, and device/country reports.

### End-of-project checks (NOT code review — do these once the system is whole)
Per-feature `/code-review` continues as normal; these are the ones that only make
sense at the end: `/security-review` · deliverability checklist (SPF/DKIM/DMARC,
warm-up, auto-pause) · a real-volume send (~800) for timing · one full path
(add contact → template → send → track → unsubscribe) · deploy rehearsal
(nginx, SSL, backups).

## ⏭️ Not built yet — full backlog (Phase 2+)
- **Unified table** ✅ **DONE** — shared `DataTable` (`components/ui/data-table.tsx`)
  + muted `Tag` (`components/ui/tag.tsx`) now used by **Contacts, Campaigns, Templates,
  Dashboard, AND the send page**. Rules applied: same field order; header darker + medium
  (not bold); record cells (incl. email) muted; fixed column widths; `indexed` prop adds a
  shared `#`; inset first/last column padding; Type = muted `Tag`, Status = coloured
  `StatusBadge` (the one loud element); `loading` prop avoids a false-empty flash;
  `emphasis` column option for a reliable darker column.
  - ✅ **Send page migrated** (PR #6, branch `claude/send-page-datatable`, merged
    2026-07-20): recipients + audience-preview tables now use `DataTable` via a shared
    `contactColumns` helper (focused columns `# · Email · Name · Type` + `Status/Opened/
    Clicked` after send; Company/Plan/Country dropped as segmentation-only). Same PR also
    refined the send page's **email preview**: iframe auto-sizes so header+body scroll as
    one; bigger desktop frame; zoom 50–100%; compact header; **mobile** scales the whole
    card to a phone frame (no horizontal scroll). Plus fixes: page horizontal-overflow,
    canvas/inspector header-border alignment, and default tab (sent→Recipients,
    draft→Email Preview) with a loading gate so no wrong-tab flash on reload.
- **Working global search** (sidebar box is visual only).
- **Saved segments** (contact `type`/`company` filter chips are done; saving a
  named segment + more filter fields still pending).
- **Dashboard widgets** ✅ **DONE** — engagement chart + deliverability card + real
  stat tiles (see the Analytics entry above). Still open: per-tile sparklines and
  device/country/email-client breakdowns (needs an `EmailEvent` table first).
- **Template editor** ✅ done (template + HTML; ready-made starters auto-seeded;
  duplicate; Starter/Yours). Later: image **upload** button (R2), a no-code editor
  (drag-and-drop / fill-in-fields), per-team folders/brand kit.
- **Automations**. (**Analytics** screen ✅ done.)
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
