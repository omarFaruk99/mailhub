# CLAUDE.md — Email Marketing System

Project instructions for Claude Code. Read this first in every new session.

## What this project is

A **self-hosted, multi-brand email marketing system** for the company
**Inno Travel Tech** (mother company). It sends product updates, bug fixes,
new features, and promotions to clients of several separate products/brands
(Innovate Solution, Tripgic, Tripmargin, and more in future).

Full plan: **[FINAL-PLAN.md](FINAL-PLAN.md)** — read it before doing design work.
Beginner glossary (Bangla): **[GLOSSARY.md](GLOSSARY.md)**.
**Bulk mail / AWS SES setup: [AWS-SES-BULK-MAIL-GUIDE.md](AWS-SES-BULK-MAIL-GUIDE.md)**
— a general, click-by-click guide to standing up bulk mail on SES (account, domain,
SPF/DKIM/DMARC, production access), written so a non-developer can follow it.
**Answer SES/deliverability questions from that file, and update it rather than
re-explaining in chat.** It replaced the old EMAIL-GUIDE.md, which the owner
deleted on purpose (2026-08-22): that file had become a project diary, and the
project's own status belongs in PROGRESS.md instead. Our SES account facts live
in PROGRESS.md § "Office AWS SES account".
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

## The rule that outranks the others: build the MVP

Owner, 2026-08-22: *"we are creating MVP. if we create heavy from start then it
make me overwhelming."* The smallest thing that solves the stated problem — every
time. **If the owner does not do it today, it is not MVP**: it goes in
FINAL-PLAN.md, not into the build.

The rule is about **not building** things, not about hiding what is built. Asked
directly whether the send page's three filter dropdowns (Plan / Country /
Company) should collapse behind an "Add a filter" button, the owner chose to
**keep all three visible**. So do not "tidy" that panel away — three plain
controls they can see beat one control that hides them.

This has already cost real work. Saved segments were built, reviewed three times
and parked unmerged, because the owner sends to every contact type with no filters
and the five-control Filters panel it produced drew *"I can see this and it
overwhelming"*. Prefer fixing a bug the owner can see over adding a capability
they never asked for. Details: PROGRESS.md § 2026-08-22.

**And the bigger version of the same rule:** this app has never sent one email to
one real customer — the company still runs its mail from WordPress. Deploying it
beats anything else on the backlog. See PROGRESS.md § "Recommended next steps".

## Current status (read first)
**Phase 1 MVP is BUILT and working locally** — backend (Express + Prisma + PostgreSQL
in Docker) and frontend (Next.js) both run. Verified end-to-end (14/14 checks) and
real emails delivered via Amazon SES — now the **office account, us-east-1,
production** (the personal dev sandbox it started on is gone).
Frontend is styled in a clean **Loops-style** look (left sidebar, soft violet accent,
light/dark). Details, exact "done vs next", and run commands are in **PROGRESS.md**.

**Two Phase 2 items are also done:** the **analytics dashboard** and **scheduling**
(send later, with timezone — pg-boss jobs stored in our own PostgreSQL, so a
scheduled send survives a restart). **Auto-pause is now done too** — the last
Phase 1 guardrail, and the one big tools have that we didn't.

**⚠️ SES: the office account has arrived, and `.env` has not caught up.** As of
2026-08-22 the office AWS key is in hand and verified: **us-east-1 has production
access** (not sandbox, `HEALTHY`, 166,700/day) with `innovatesolution.com`,
`tripgic.com` and `tripmargin.com` already DKIM-verified. The old personal account
is closed for good — **never offer to "fix" its keys.**
- ✅ **Cutover done (2026-08-22).** `backend/.env` now holds the office key,
  `AWS_REGION=us-east-1` and `SES_FROM=no-reply@innovatesolution.com`, and a real
  campaign was delivered to four Gmail/Workspace inboxes — DKIM-signed by
  `innovatesolution.com`, `mailed-by amazonses.com`. **Never set the region back
  to `ap-southeast-1`:** AWS has this account SHUT DOWN there.
- 🔴 **The next blocker is `PUBLIC_URL`, and it is bigger than it looks.** It is
  unset, so every unsubscribe link, open pixel and tracked link in a sent email
  points at `http://localhost:4000`. Open and click tracking therefore record
  **nothing**, and — worse — Gmail's one-click unsubscribe POSTs to that dead
  address, so a client who unsubscribes is never suppressed and keeps being
  emailed. Only a deploy can fix it, which is why deploy is now step 2.
- **It is a shared LIVE account** — 83 identities, real customer mail for other
  travel brands. The sandbox used to make a coding mistake harmless; that net is
  gone. **Test only to `success@simulator.amazonses.com`.** Our bounce/complaint
  rates now touch other brands' reputation, so auto-pause matters much more.
Full detail: PROGRESS.md § "Office AWS SES account".

**Dev servers:** after a merge, branch switch, or laptop restart, **restart both dev
servers** — an orphaned Next.js process serves stale CSS/JS and looks like a bug
(this happened once; the chart lost its colours). If it looks wrong: stop dev →
`rm -rf frontend/.next` → `npm run dev`.

**UI reference (liked):** the chosen look is concept **demo #1 (Loops style)** — use it
as the visual reference for new screens. Demo URLs are listed in **PROGRESS.md**
(§ Concept demos). When building filters/templates/analytics etc., match that look.

**Editing and deleting — the rules are policy, not implementation detail:**
- **What may be edited is decided by whether an email REACHED anyone**, never by
  `status` (they disagree in both directions — see PROGRESS.md). Once anyone has it,
  a campaign's subject/html/category are frozen; the name stays editable. Duplicate
  makes a new version.
- **Contact `status` is never editable**, and a **suppressed contact's email address
  cannot be changed** — suppression is keyed by address, so a rename would hand them
  an unblocked identity. Fixing a typo = delete + add.
- **Deleting a contact never deletes their Suppression row.** That row is what stops
  a later CSV import from re-emailing someone who unsubscribed.
- Deleting campaigns/contacts also removes the recipient rows behind **analytics and
  the auto-pause denominator**. That is allowed, and the confirm dialogs say so.

**No emoji in anything a client receives.** Owner, 2026-08-22: *"delete emoji from
subject that looks cheap."* That covers email subjects and bodies, the unsubscribe
page (a client lands there straight from their inbox), and the **placeholders** in
the subject boxes — a rocket sitting in the placeholder was teaching the habit.
Emoji in our own docs and in the app's own chrome (the `⌘K` badge) are fine.

**Writing for this user in the UI:** short sentences, plain global English, and lead
with the consequence rather than the mechanism ("If you change their email address,
they will start receiving emails again" beat "we block by address, not by person").
The user reads English as a second language and will say when a string is unclear —
that feedback is about the wording, not the feature.

**Free-text fields that feed send filters must be pickers.** Filters match exactly,
so `Paid`/`paid` or `USA`/`United States` silently split one audience in two.
Contacts' plan and country use `components/ui/combobox.tsx`; merge existing values
case-insensitively so a dropdown never offers both spellings.

**Styling — use theme tokens, not hardcoded colors.** Colors/fonts are design tokens in
`frontend/src/app/globals.css` (change once → whole app; light/dark aware). Prefer the
token classes: `text-foreground` / `text-muted-foreground`, `bg-primary` /
`bg-background` / `bg-muted`, `border-input`, brand accent = **violet**, danger/required =
**`text-destructive`** (e.g. required-field `*`). Avoid hardcoded Tailwind colors like
`text-red-500`. Required fields: use `<Label required>…</Label>` (renders the `*`).

**Dev scope — REVERSED 2026-08-22.** The old rule was "build every feature first,
deploy LAST", because SES production access was months away. It is not: the office
account already has it. **The new sequence is SES cutover → deploy → one real send
→ leave WordPress → then ask what to build.** Feature work is on hold, including
items that were "next" yesterday (segments, global search, Teams/RBAC, multi-brand).
Full list and reasoning: PROGRESS.md § "Recommended next steps".

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
  - **A second must-mirror pair:** `matchesText` + `selectAudience`
    (`backend/src/email/audience.ts`, authoritative — it decides who is emailed)
    and `matches` + `audienceOf` (`frontend/src/lib/audience.ts`, which produces
    the "N people will receive this" the sender approves). **Change one, change
    the other**, or the screen promises one audience and the server mails
    another. Both compare in plain JS on purpose: Prisma's
    `mode: "insensitive"` compiles to `ILIKE`, so `%` and `_` in a plan or
    country would act as wildcards (measured: a filter of `"%"` matched every
    contact with a plan).
  - The category rule is written **twice** — `defaultTypesForCategory`
    (`backend/src/email/send-campaign.ts`, authoritative: applied whenever a request
    omits `includeTypes`) and `defaultTypes` (`frontend/.../campaigns/[id]/page.tsx`,
    mirrors it to pre-check the boxes). **Change both or neither.**
  - It is a **pre-check, not a lock**; the confirm dialog shows the audience and the
    recipient count before sending. Decision 2026-07-28: keep it (big tools
    pre-select nothing, but that suits hundreds of lists and new staff daily, not a
    2–3-sends-a-week team whose policy this *is*). **Revisit at Teams + RBAC.**
- **A scheduled campaign's audience is frozen** in `Campaign.sendOptions` and is what
  the send page shows from then on — **including after "Cancel schedule"**.
  Cancelling cancels the *time*, not who receives it.
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
- **`PUBLIC_URL` must be the real outside URL on the server.** Every unsubscribe /
  open / click link in an email points at it and is opened days later from someone
  else's inbox. Leaving it at localhost ships dead links to real customers.
- Keep **bounce < 5%**, **complaint < 0.1%** — those are the **targets** shown on the
  Analytics screen. **Auto-pause** (built; `backend/src/email/auto-pause.ts`) is the
  **emergency brake** and sits deliberately looser — bounce 5%, complaint **0.3%**
  (where Gmail/Yahoo actually penalise), plus floors of 50 emails and 2 events. At the
  0.1% target a *single* complaint in an 800-person send would halt the company.
  Keep these two levels distinct — do not "fix" the brake down to the target.
- A pause is **per brand** and only a **person** can lift it. Never add auto-resume:
  it would restart the very send that caused the spike.
- `/track/click` must only redirect to links found in the campaign **that recipient**
  was sent. Anything looser is an open redirect on our own sending domain. Match
  against the **stored** HTML (merge tags as wildcards), never a recipient's
  personalized copy — that ties old links to the contact's current name and a rename
  kills them. The **origin** is the boundary; do not tighten the wildcard to exclude
  spaces or slashes (real names contain both).
- Separate **transactional vs marketing** (ideally separate subdomains).
- Handle bounces/complaints via SES→SNS webhook (verify SNS signature).
- **Exactly-once sending** (no double emails on retry/crash).
- Images in email = hosted on R2, embedded by link. Prefer download links over
  attachments (small important files only as real attachments).

## Volume (current)

- ~700–800 recipients per send; ~8,000–10,000 emails/month.
- Small volume → shared IP is fine, no dedicated IP needed.

## Build phases (see FINAL-PLAN.md §10 for detail)

1. **Phase 1 (MVP)** — ✅ **complete**: one brand: sender identity, contacts + CSV
   import, one broadcast via SES with filter, unsubscribe + suppression,
   bounce/complaint webhook + ~~auto-pause~~ ✅, exactly-once sending, basic
   open/click tracking.
2. **Phase 2** — multi-team + RBAC, approval workflow, template editor, filters +
   saved segments, ~~scheduling + timezone~~ ✅, ~~analytics dashboard~~ ✅.
3. **Phase 3** — multi-brand, preference center, automation/drip/triggered, A/B.
4. **Phase 4** — API auto-sync, list cleaning/sunset, monitoring, advanced deliverability.

## Deferred (do NOT build now)

- Group / cross-brand campaigns from the mother company (dedupe across brands).
- Group consent is **not** being collected now → future group sending will need
  fresh consent gathered at that time.

## Workflow notes

- **Review-before-reporting rule (MANDATORY):** after building a feature, run
  **`/code-review` TWICE** — fix everything real from the first pass, then run it
  again on the fixed code — **before** telling the user the work is done. The second
  pass is not optional: round-1 fixes are new, unreviewed code and regularly
  introduce their own bugs (this is exactly how it went with the analytics
  dashboard — 9 findings, then 4 more caused partly by the first round's fixes).
  When reporting, state what each pass found and what was fixed. The user should
  never have to ask for a review.
  - **The slash command may be blocked from model invocation.** If the Skill tool
    refuses it, say so plainly and do the passes by hand — then ask the user to run
    `/code-review` themselves. Worth it: on scheduling, the real tool found the
    serious one (a superseded job could still send) that three hand passes missed.
  - Reviews rarely reach zero, and that is normal — each round reaches a rarer
    layer (round 3 on scheduling found a once-a-year DST bug). Judge by "would this
    hurt the business?", not by "is the count zero?".
  - **Bugs found by actually using the app still get through review.** The
    "cancel schedule resets the audience" bug read as sensible code and was only
    obvious in use. Prefer clicking through a feature over re-reading it.
- **Test data:** use SES's `success@simulator.amazonses.com` (accepted on a
  production account too,
  no real person is emailed). Name test rows with a clear prefix and **delete them
  when done** — the user should never inherit test clutter.
- **Branching rule:** for a **big feature**, ALWAYS create a branch first
  (e.g. `claude/<feature-name>`), build & test there, then merge to `main` via PR once
  it works (so main never breaks; a bad attempt is just a deleted branch). Only
  **small changes** (typo, doc, one-line fix) go straight to `main`.
- Local dev → GitHub push (never commit `.env`/secrets) → pull on server →
  `docker-compose up` → run migrations → nginx + SSL.
- Claude handles setup (docker-compose, migrations, nginx, SSL, backups). The user
  does the familiar push/pull and checks the result.
- **There is no sandbox to test in any more** — the only account is the office
  one, and it is production. Use the SES **simulator** addresses, which are
  accepted on a production account and delivered to nobody:
  `success@simulator.amazonses.com` (a clean send),
  `bounce@simulator.amazonses.com` (suppression), and
  `complaint@simulator.amazonses.com`. **Never invent a fake address** like
  `someone@example.com`: on a production account that is a real hard bounce
  counted against every other brand sending from that account.
