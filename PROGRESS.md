# PROGRESS — where we are

_Last updated: 2026-08-24 · Read this first in a new session._

> 📧 **AWS SES setup facts for our own account are in § "Office AWS SES account"
> below.** This file is where project status (including SES) belongs. It
> replaced an older EMAIL-GUIDE.md, deleted by the owner on purpose because
> that file had turned into a project diary.

> 🎯 **Build the MVP, not the full version.** Owner, 2026-08-22: *"we are creating
> MVP. if we create heavy from start then it make me overwhelming."* The smallest
> thing that works, every time. New controls start hidden. If the owner does not
> do it today, it is not MVP — it goes in FINAL-PLAN.md, not into the build.
> This is why saved segments are parked (see below): the feature worked, and the
> five-control Filters panel it produced was the problem.

## ✅ Phase 1 (MVP) — BUILT & verified (local dev)

Backend and frontend both work. Verified end-to-end (14/14 automated checks) and
real emails delivered via Amazon SES.

### Backend — `backend/` (Express + TypeScript + Prisma 7 + PostgreSQL)
- **Brands**: create, list.
- **Contacts**: add, list, **edit**, **delete**, **CSV import** (Papa Parse). Rule
  enforced: one email = one contact per brand (unique `[brandId, email]`). Each
  contact has a **`type`** (`client` | `prospect` | `internal`) and optional
  **`company`** (external company name, for filtering; blank for internal/individuals).
  - **`status` is not editable** (`PUT /contacts/:id` ignores it). It records what
    the PERSON did — unsubscribed, bounced, complained — and typing over it would
    re-enrol someone who asked to be left alone.
  - **A suppressed contact's email cannot be changed.** Suppression is keyed by
    address, so a rename hands them a fresh, unsuppressed identity. The UI locks the
    field and says why; fixing a genuine typo means delete + add.
  - **`DELETE /contacts/:id`** removes their `CampaignRecipient` history but **never
    their Suppression row** — that row is what stops a later CSV import from quietly
    re-adding an unsubscribed person. Refused while any campaign of the brand is
    `sending` (plus a `P2003` catch for the race).
- **Campaigns**: create (draft), list, **edit**, **delete**, **send/broadcast** with
  filter (plan/country/**company**/**contact type**), **exactly-once**
  (unique `[campaignId, contactId]`), recipients list.
  - **What may be edited is decided by whether the email REACHED anyone, not by
    `status`** — the two differ in both directions. A `sent` campaign whose every
    attempt failed reached nobody and stays fully editable; a campaign auto-pause
    stopped halfway is back to `draft` while holding hundreds of send records. Rows
    still at `sending` count as delivered (the row is written *before* the SES call,
    so the message may well have gone out).
    Once anyone has it, subject/html/category are frozen — their copy cannot be
    recalled, and `/track/click` validates against the stored HTML. **The name stays
    editable** (internal label, never sent). Use **Duplicate** for a new version.
  - **Category cannot change while `scheduled`**: the audience was frozen for the old
    category, so relabelling "Product updates" → "Marketing/Offers" would send
    marketing to internal staff. Cancel the schedule first.
  - **`DELETE /campaigns/:id`** removes the campaign *and* its recipient rows — which
    are the analytics *and* the auto-pause denominator, so both change. Allowed on
    purpose (clearing test campaigns is a real need); the confirm dialog says what is
    lost. Recipient rows and campaign go in **one transaction with the campaign row
    last** under the same `status != "sending"` guard, so a send claiming it mid-delete
    rolls everything back rather than destroying the exactly-once records. The queued
    job is cancelled **after** the transaction commits.
  - **Audience by type:** send accepts `includeTypes` (which contact types receive it).
    Category defaults: **Marketing/Offers → client+prospect**; **Product updates → all
    (client+prospect+internal)**; **Tips / Transactional → client** (user can adjust via
    checkboxes). `internal` = our own colleagues; never in the default marketing audience.
- **Unsubscribe**: link + **one-click List-Unsubscribe header (RFC 8058)**; GET page + POST.
- **Suppression**: per-brand; unsubscribe/bounce/complaint excluded from sends.
- **SES sending**: `@aws-sdk/client-sesv2`, UTF-8, custom headers.
- **Webhook** `/webhooks/ses` (SNS): bounce/complaint → auto-suppress; SNS signature
  verify (`sns-validator`); dev bypass env `SNS_SKIP_VERIFY=true`.
  - ⚠️ **Built, but nothing in AWS publishes to it yet** — so in practice bounce and
    complaint handling does not run at all. What is missing, and who does which
    half: § "Office AWS SES account" item 2.
- **Tracking**: open pixel `/track/open`, click redirect `/track/click` → sets
  `openedAt` / `clickedAt`. The click route only redirects to a link that appears in
  the campaign this recipient was sent (`isCampaignLink` in `send-campaign.ts`).
  Without that it was an **open redirect** — anyone could point our domain at a
  phishing page, which is how a sending domain's reputation gets destroyed by
  someone who never touched the account.
  - Matched against the **stored** HTML with merge tags as wildcards, *not* against
    one recipient's personalized copy: doing the latter tied every past link to the
    contact's name as it is NOW, so renaming someone killed the links already in
    their inbox.
  - The security boundary is the **origin**, checked exactly. The wildcard excludes
    `?` and `#` (no query string can be bolted on) but allows spaces and slashes —
    real names contain them, and rejecting whitespace broke personalized links for
    anyone called "John Smith". Control characters are refused (CRLF would otherwise
    make `res.redirect` throw a 500).
- **`PUBLIC_URL`** (new env) is the address the backend is reachable at from the
  outside. Every unsubscribe link, open pixel and tracked link points there, and
  they are opened days later from someone else's inbox — on the server this MUST be
  the real public URL. It used to be hardcoded to `localhost:4000`, which would have
  shipped broken links to real customers. Unset in dev → falls back to localhost.
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
- **Auto-pause (circuit breaker)** — `src/email/auto-pause.ts`. Sending stops for a
  **brand** when bounce/complaint rates spike; only a person can resume it.
  - Checked in four places: before `/send` (423), before the scheduled worker runs,
    at the top of `sendCampaign`, and **every 25 emails inside the send loop** — a
    bounce webhook can trip the breaker halfway through a 700-person send, which is
    the case it exists for. The webhook itself re-checks the moment SES reports a
    bounce/complaint.
  - **Emergency levels, looser than the Analytics targets on purpose:** bounce 5%,
    complaint **0.3%** (where Gmail/Yahoo actually penalise). At the 0.1% *target*
    one complaint in an 800-person send is 0.125% and would halt the company.
    Two floors stop small numbers looking like disasters: `minSent` 50 and
    `minEvents` 2. All tunable via `AUTOPAUSE_*` env (see `.env.example`).
  - **Both sides of the rate use the same window AND the same population:** an event
    only counts if that address was mailed *within the window*. Sends are stamped
    when they go out, bounces when SES reports them (days later) — without this, an
    old send's bounces divided by a small recent denominator read as 40%+.
  - `Suppression.lastEventAt` (new) is when the reason was last set — `createdAt`
    can't answer that (unsubscribed in March, bounced in July keeps March).
  - `Campaign.lastError` (new) records why an attempt did not finish, because the
    worker runs with nobody on screen. Cleared by `/send`, `/schedule`, `/unschedule`.
  - A send stopped mid-way goes back to **draft**, not "sent" — "sent" would claim it
    finished and would block scheduling the people who were missed.
  - API: `GET /brands/:id/sending-status` · `POST /brands/:id/resume-sending`
    (`{force:true}` overrides a still-breached threshold) · `POST /brands/:id/pause-sending`.
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
- Screens: **Dashboard**, **Contacts** (add + **edit** + **delete** + CSV import;
  type filter chips, type badge; row **⋯ menu**), **Templates** (list with **Starter/Yours**
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
- **"Send test" is now live (2026-08-24)** — `POST /campaigns/:id/send-test`. It used
  to be a dialog that only said "coming in a later step (it needs SES production
  access)"; production access has existed since the office cutover, so the message
  was simply out of date. Sends the campaign's real content to one address, subject
  prefixed `[TEST]`, prefilled with the logged-in user's email.
  - **It is a real message from the shared live SES account, so it keeps the same
    guardrails as a real send:** auto-pause is checked (`sendCampaign` is the choke
    point that normally enforces it, and this route does not go through it), and the
    address is refused if it is suppressed. It also carries the unsubscribe footer +
    RFC 8058 headers, which CLAUDE.md requires of every email.
  - **The unsubscribe link in a test is a deliberate no-op** (`/unsubscribe?...&test=1`
    → "This was a test email"). Nothing in the codebase can delete a `Suppression`
    row, so a live link clicked by whoever is checking their own test — or prefetched
    by a mail scanner — would lock that address out of every future campaign with no
    way back. The check is `test === "1" && !c`, deliberately fail-closed: a bare
    truthy check made `?test=0` on a *real* link silently skip the unsubscribe.
  - **No `CampaignRecipient` row**, so no open pixel, no `/track/click` rewriting and
    no send in analytics. **This cuts one way only:** if a test bounces or is marked
    as spam, SES still reports it, so the address is still suppressed and the event
    still counts toward auto-pause — while the test itself is not in the denominator.
    Accepted rather than engineered around: a hard-bouncing address is genuinely bad,
    and knowing a bounce came from a test would mean tagging test sends separately.
  - The old unauthenticated-by-design-but-unguarded `POST /test-email`
    (`routes/email.ts`) was **deleted**: nothing called it, and it could mail any
    address from the production domain with no suppression, auto-pause or unsubscribe
    checks at all.
  - Four `/code-review` passes. Round 1 caught a dropped error message and a missing
    `required` marker; round 2 caught the missing suppression/auto-pause/unsubscribe
    guards; round 3 caught that requiring the address to be a Contact would fail on
    the first click in production (the login address is not a contact there) and that
    a live unsubscribe link was a trap; round 4 caught the `?test=0` fail-open.
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

### Contact dialog + shared form controls (read before touching contact forms)
- **Add and Edit share one `ContactFields` component**, so they cannot drift apart.
  Three even rows, paired by what each answers: **Email | Full name** (who),
  **Type | Company** (how we group), **Plan | Country** (what we know). `Status` is a
  read-only badge **next to the dialog title** — it is not something you fill in, and
  in the grid it made the rows uneven.
- **Plan and Country are pickers, not free text** (`components/ui/combobox.tsx`).
  This is a correctness fix: send filters match **exactly**, and the data already
  held both `Paid` and `paid`, so a contact typed one way silently dropped out of a
  send filtered the other way. `USA`/`United States` is the same trap.
  - Options = the standard list **plus whatever the brand already uses**, merged
    **case-insensitively** with the standard spelling winning — otherwise the
    dropdown helpfully offered both `Paid` and `paid`, i.e. the original problem.
  - A contact stored as `paid` displays as `Paid`, so saving normalises it. The old
    spellings clean up through ordinary use; no migration.
  - Country names come from **`Intl.DisplayNames`** over a short ISO-3166 code list
    (`lib/countries.ts`) — no package, no hardcoded name table. Same approach as the
    timezone picker.
- The `Combobox` stops Escape propagating while its list is open, so dismissing the
  list does not also close the dialog and discard the edits. (Base UI's `Select`
  already handles this itself — verified, first Escape closes the list, second
  closes the dialog.)

### DB schema (Prisma models)
Brand (now with the auto-pause fields `sendingPaused` / `pausedAt` / `pauseReason` /
`pausedBy`), Contact (now with `type` + `company`), Campaign (now with the scheduling
fields + `lastError`), CampaignRecipient, Suppression (now with `lastEventAt`),
Template, **User** (login accounts — see § "Simple login"), **Session**.
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
| Send pacing | 200ms sleep between emails, but the real rate is **~1.6/sec** — measured 2026-08-22: ~0.40s per SES round trip to us-east-1 + 0.20s sleep + ~0.02s of DB writes = ~0.62s each. **800 recipients ≈ 8–9 minutes.** AWS allows 19/sec, so we use about 8% of the ceiling; the sleep is deliberate headroom for auto-pause to stop a bad send |
| Analytics | 30-day range; warn at bounce 5%, complaint 0.1% |
| Plan / country / company filter | matched **case-insensitively and trimmed**, and blank means "any". Compared in plain JS (`matchesText`), never with Prisma's `mode: "insensitive"` — that compiles to `ILIKE`, where `%` and `_` are wildcards |
| A blank text filter | **refused with 400.** Present-but-blank is not ignored, because ignoring it WIDENS the send: `{"plan":" "}` would reach the whole brand. Omit the key instead |

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

## Dev database — reset 2026-08-22, read before sending anything

The old test data was deleted the moment SES went to production, because a fake
address is no longer harmless: in the sandbox it failed quietly, on a live shared
account it is a **real hard bounce** counted against 83 other brands' reputation.
Four of the seven subscribed contacts were `@example.com`, i.e. a 57% bounce rate,
and **auto-pause would not have caught it** — its `minSent` floor is 50 and there
were 7.

What is in the dev database now:

| | |
| --- | --- |
| Contacts | **4, all mailboxes the owner controls** — one per type/plan/country so filters are testable: `omarfaruk19952035@gmail.com` (client · Paid · ABC Travel · Bangladesh), `shuvon19952035@gmail.com` (client · Free · Sky Tours · UK), `omar@innovatesolution.com` (internal), `omar.25innovate@gmail.com` (prospect · Trial · Skyline Travel · US) |
| Campaigns | the one real test send (14 test campaigns deleted) |
| Templates | 6 = the 3 auto-seeded starters × 2 brands. **The starters are not test data** — do not delete them |
| Suppression | 0 |
| Brands | 2 — "Innovate Solution", plus an empty leftover "Verify Brand" from an old verification run |

**Rules that follow from this:**
- **Never add a fake address.** Use `success@simulator.amazonses.com`, which SES
  accepts and delivers to nobody.
- The category→audience defaults now produce three different totals here
  (Product updates → 4, Marketing/Offers → 3, Tips/Transactional → 2), which is
  what makes them worth testing.

## Run locally
1. `docker compose up -d db`
2. `cd backend && npm run dev`   (http://localhost:4000)
3. `cd frontend && npm run dev`  (http://localhost:3000)
- **The app now requires login.** A fresh database has no accounts — create one:
  `cd backend && ADMIN_EMAIL=you@innovatesolution.com ADMIN_PASSWORD='...' npx tsx src/scripts/seed-admin.ts`.
  Re-running it with the same email resets that password. See § "Simple login".
- Prisma Studio: `cd backend && npm run prisma:studio`
- **There are TWO `.env` files, and they are not interchangeable.** The one at the
  repo root is read by **docker-compose** (`DB_USER` / `DB_PASSWORD` / `DB_NAME`);
  `backend/.env` is the only one the **backend process** reads. Both happen to
  declare `AWS_*` names, but the root copy's are empty and nothing reads them
  today. **At deploy this becomes a trap:** once backend/frontend services are
  added to docker-compose, whichever file feeds the container is the one whose
  region and key are used — point it at `backend/.env`'s values, or a send will
  fail with credentials that look present.
- **`.env` changes do not hot-reload.** `tsx watch` only watches `.ts`, so after
  editing `backend/.env` the server must be restarted — and a plain restart is not
  always enough: killing the npm wrapper can leave the node child holding port
  4000 with the OLD environment. That cost half an hour on the SES cutover, with
  the symptom being `UnrecognizedClientException` from a key that was verified
  working seconds earlier. Check `netstat -ano | grep :4000` and compare the
  process start time against the file's modified time.
- New migration after schema change: `cd backend && npx prisma migrate dev --name x && npx prisma generate`

## Email / SES
See **§ "Office AWS SES account"** below — that is the live answer. In short:
office account, region **us-east-1**, **production access already granted**, and
`innovatesolution.com` / `tripgic.com` / `tripmargin.com` verified with DKIM.
`backend/.env` is switched over and a real campaign has been delivered.

## How far we can go WITHOUT SES production access + deploy (SUPERSEDED 2026-08-22)

> ⚠️ **This section is history.** It was written when SES production access was
> months away. The office account already has it (see below), so the wall this
> section describes is gone. Kept only to explain why earlier work was sequenced
> feature-first. **The live sequencing decision is in "Recommended next steps".**

**What it said, in one paragraph:** build every feature first using the personal
sandbox, and leave SES production access + deploy until real launch, because
production access was expected to take days of AWS approval we did not have. That
is why analytics, scheduling, auto-pause and edit/delete were built before the
app was ever deployed.

**Every specific claim in it is now false**, which is why the detail was removed
rather than left to be skimmed: the personal sandbox no longer exists, its two
verified recipients lapsed with it, "needs production access" is done, and a fake
address no longer "shows Failed" — on the live account it is a real hard bounce.
Nothing here should guide a decision. Use "Recommended next steps".

## ✅ Office AWS SES account — ARRIVED (2026-08-22), and it changes the plan

The owner supplied the office AWS key (`inno-product-update`). Verified read-only
against AWS the same day:

| Region | State |
| --- | --- |
| **us-east-1** | ✅ **USE THIS.** Production access (NOT sandbox), `HEALTHY`, quota **166,700/day** at 19/sec, ~2,553 real emails in the last 24h |
| **ap-southeast-1** | ❌ **NEVER USE.** `EnforcementStatus: SHUTDOWN` — AWS has disabled sending for this account in that region |
| ap-south-1 / eu-west-1 | sandbox, irrelevant |

**All three brand domains are already verified, DKIM `SUCCESS`, signing on:**
`innovatesolution.com` · `tripgic.com` · `tripmargin.com`
(also `innovatesolution.org` and three `@innovatesolution.com` addresses).
Custom MAIL FROM is **not** set on any of them.

**What this cancels:** "#SES production access — apply in AWS, takes days" is
**done already**. It was the last big blocker in the plan and it no longer exists.

### ✅ Cutover done, and the first real send worked (2026-08-22)
`backend/.env` holds the office key, `AWS_REGION=us-east-1` and
`SES_FROM=no-reply@innovatesolution.com`. A campaign built from the "Product
update" starter reached four inboxes the owner controls: **DKIM-signed by
`innovatesolution.com`**, `mailed-by amazonses.com`, TLS, three in the Inbox and
one in Trash (Gmail-side, and Trash is not Spam — Gmail did not judge it).
**Never set the region back to `ap-southeast-1`:** AWS has this account SHUT DOWN
there, and none of our domains are verified in it.

**⚠️ Three things to hold on to:**
1. ✅ **`PUBLIC_URL` blocker — resolved 2026-08-24.** It used to be unset, so every
   unsubscribe link, open pixel and tracked link in a sent email pointed at
   `http://localhost:4000` — open/click tracking recorded nothing, and Gmail's
   one-click unsubscribe POSTed to a dead address. The deploy in § "Recommended
   next steps" item 3 set it to the real `https://mailhub.omarsec.com`, so this no
   longer applies **on that server**. Still applies to local dev, which is fine —
   local dev never needs to receive real tracking/unsubscribe traffic.
2. ✅ **Bounce/complaint handling — wired in code AND in AWS, verified working
   (2026-08-24).** It used to run nowhere: the office account held two
   configuration sets, `Innovate-Email-mailflow` and `yourtripdesk-prod` (**both
   other brands' — still do not touch either**), and `innovatesolution.com` had no
   configuration set of its own. A third set, **`productupdate-config`**, now
   exists alongside them for this project only. Full detail of what was set up:
   § "Recommended next steps" item 3.
   - **Code half** (done 2026-08-23, unchanged). `src/email/ses.ts` passes the env
     var `SES_CONFIGURATION_SET` as `ConfigurationSetName` on every send — that
     file builds the only `SendEmailCommand`, so it covers campaign sends and test
     sends alike. **Deliberately not set in local dev's `backend/.env`** (no SNS
     topic locally, and a name that doesn't exist makes SES reject every message)
     — only ever set on the deploy server.
   - **AWS half: done.** SNS topic → configuration set → event destination
     (**Hard bounces + Complaints**) → topic access policy for `ses.amazonaws.com`
     → HTTPS subscription → confirmed → verified with a real
     `bounce@simulator.amazonses.com` send. The owner rehearsed all of this once in
     their own personal AWS account/region first, then repeated it in the office
     account for real — useful pattern for handing this kind of AWS console work
     to someone less experienced (their DevOps colleague) next time.
   - **Why a configuration set and not identity-level SNS feedback
     notifications:** the identity is the shared `innovatesolution.com` domain and
     other office systems send from it, so identity-level notifications would push
     their bounces into our webhook too. The configuration set is named only on
     our own sends.
   - AWS's own **account-level suppression list** is on by default and does
     already stop repeat sends to an address that hard-bounced, so this is not the
     only guard. But it is invisible to us: our database, our Analytics screen and
     our auto-pause denominator learn nothing from it. That is what the webhook is
     for.
3. **This is a shared, LIVE production account** — 83 verified identities, real
   customer mail for many other travel brands. The sandbox used to be the safety
   net that made a coding mistake harmless; **that net is gone.** Test only to
   `success@simulator.amazonses.com`. Our bounce/complaint rates now affect other
   brands' reputation, which makes auto-pause matter far more than before.
   Related: the backend has **no request logging**, so when the first send raised
   "did Gmail's unsubscribe reach us?" there was no way to answer it from our
   side. Worth adding with the deploy.

### The personal dev account (history — do not try to revive)
The personal AWS account was **closed** when its 6-month free plan ran out, so its
`AKIA…` keys answer `UnrecognizedClientException`. Deliberately let go: real
sending was always moving to the office account, and that account also held an old
**EC2** instance whose meter would restart on reactivation. Its `omarsec.com`
verification, DKIM CNAMEs and two verified sandbox recipients have lapsed — not a
bug. Worth remembering: the cost risk in AWS is **servers** (EC2/Lightsail,
~$8–15/month whether used or not), not **SES** (~$0.10 per 1,000 emails).

## 2026-08-22 — the plan/country filter bug, and segments parked

**Bug fixed (branch `claude/ses-office-account`, commit `51245f1`).** `company` was
matched case-insensitively but **`plan` and `country` were matched EXACTLY**, and
the data really holds both `Paid` and `paid` — five contacts on one spelling, one on
the other. Filtering by either silently left the other group out of the send.
Nobody can see a contact that is missing from a count; the total just looks about
right. **The owner spotted it themselves** ("Paid" appearing twice in a dropdown).
- `backend/src/email/audience.ts` is now the **single definition** of "who does this
  filter select", used by the send loop. `frontend/src/lib/audience.ts` is the
  browser's mirror, so "N people will receive this" is a promise the server keeps.
  **Change one, change the other.**
- `backend/src/email/filter-types.ts` holds `CONTACT_TYPES` / `SendFilter` so
  `audience.ts` and `send-campaign.ts` can share them without an import cycle.
- `frontend/src/lib/options.ts` holds the shared plan/country option lists (moved
  out of the Contacts screen, which had its own copy), merged case-insensitively so
  no dropdown offers `Paid` and `paid`, with discovered values sorted.
- Send page gained a **Country** filter (the backend always accepted it), and a
  filter value with no matching `<option>` stays selectable — otherwise the box
  renders EMPTY while the filter is applied, so the send reaches fewer people than
  the control admits.

**Saved segments: BUILT, then PARKED — do not rebuild.** Named audience rules
("Paid clients · Bangladesh") storing the *rule*, not a list of people: Audiences
screen with live counts, a picker in the send page's Filters panel, `ruleKey`
uniquely indexed per brand so two segments can never select the same people. Three
`/code-review` passes, all findings fixed and verified.
- **Parked because the owner does not segment at all.** They send to every contact
  type with no filters — exactly what the category→audience pre-check already does
  for free. The five-control Filters panel it produced drew *"I can see this and it
  overwhelming"*. Not a bug in the feature; the feature was not needed.
- **Where it lives:** branch **`claude/saved-segments`**, commit **`7b5f767`**.
  Not merged. Its `Segment` table and two migrations were dropped from the dev
  database so Prisma does not later offer to reset it.
- **When to revive:** the day a send goes to Paid-only, one country, or one
  company. Until then, adding it back is the opposite of MVP.

## ✅ Simple login — added 2026-08-22

Owner asked for login **before** deploy: once the app is on a public URL, no
login means anyone with the link can read contacts and send campaigns. Not a
feature — a prerequisite for step 2 below.

- **Email + password**, not "sign in with Google" — this is a 2–3-person
  internal tool, and Google sign-in needs a stable public URL for its
  callback, which doesn't exist until *after* deploy. Google sign-in can be
  **added later** without a rewrite (same `User` row, just another way in);
  the owner asked for this explicitly and it's not on the backlog yet.
- One shared account type for now — `User.role` is always `"admin"`. Full
  RBAC (Editor/Viewer/etc., FINAL-PLAN.md §4) is deferred, same as before;
  the field already exists so that later work is additive, not a rewrite.
- **How it works:** password hashed with bcrypt (`bcryptjs`). Login creates a
  `Session` row in Postgres (not Redis — matches pg-boss) and returns its id
  as a bearer token; the frontend keeps it in `localStorage` and sends
  `Authorization: Bearer <token>` on every API call
  (`frontend/src/lib/api.ts`). Sessions last 30 days. **Every backend route
  requires a valid session except** `/health`, `/track/*`, `/unsubscribe`,
  `/webhooks/ses`, `/auth/login` — the paths an outsider's browser or AWS
  hits directly, listed in `backend/src/auth/middleware.ts`'s
  `isPublicPath`. That gate runs **before** any router is mounted, so a new
  route is protected by default unless someone deliberately adds it to that
  list.
- **No accounts ship in git** (the seed script reads `ADMIN_EMAIL` /
  `ADMIN_PASSWORD` from the environment, never hardcodes a password — see
  "Run locally" above). The owner's own login was created once, by hand, the
  same way; to add a teammate, run the seed script again with their details.
  **Re-running it for an existing email also signs out every session on that
  account** (found in `/code-review` 2026-08-22) — the whole point of
  resetting a password is a stolen token stops working, so the old sessions
  cannot survive the reset.
- **`POST /auth/login` is rate-limited**: 10 attempts per IP per 15 minutes
  (`express-rate-limit`, `backend/src/routes/auth.ts`) — added after
  `/code-review` flagged that deploy (the very next step) puts this on a
  public URL with one known admin email and no limit on password guesses.
  **Deploy must set `app.set("trust proxy", ...)` to the real hop count once
  nginx is in front of it**, or every request looks like it comes from the
  proxy and shares one bucket.
- Frontend: pages live under `app/(app)/` and are wrapped in `AuthGate`,
  which sends a browser with no token to `/login`. That's a UX convenience,
  **not** the real security boundary — the backend gate above is. A session
  that turns out to be invalid (expired/revoked) is handled in exactly one
  place, `api.ts`'s `req()`, which clears the token and redirects; nothing
  else should duplicate that, or a network hiccup (backend restarting) gets
  misread as "log this person out." When the backend really is unreachable
  (not a 401 — a network error), `AuthGate` shows "Can't reach the server.
  Retrying…" and polls every 5s instead of sitting on a blank screen forever
  (also a `/code-review` find, 2026-08-22).
- **Login page redesigned (2026-08-22)** to a more finished look: "MailHub"
  wordmark + "Welcome back" heading, mail/lock icons inside the Email/Password
  fields (same pattern as the recipient search box), a soft violet decorative
  shape bottom-left, generous bottom padding under the button. Wrong
  credentials show an **inline red `Callout`** (not a toast, which fades
  after a few seconds) plus a red `aria-invalid` ring on both fields — same
  danger-callout component used elsewhere (e.g. `campaigns/[id]/edit`'s
  "campaign not found" notice). **Has a show/hide password toggle** (eye
  icon). The button stayed the app's normal black `Button` (not blue) —
  matches every other primary action in the app; changing that would be a
  whole-app decision, not a login-page one.
- **The email field's focus ring looks blue-violet — that's `--ring` in
  `globals.css` (`oklch(0.52 0.19 288)`), the same ring every input in the
  app already uses on focus** (Contacts, Campaigns, Templates forms), not
  something new added for login. Asked the owner 2026-08-22 whether to
  change it — **keep as-is**, for consistency across the whole app.
- **Theme toggle + Log out moved into a dropdown** on the sidebar's user row
  (`frontend/src/components/app-shell.tsx`), opening upward — same visual
  pattern as the workspace switcher at the top of the sidebar, and the same
  `DropdownMenu` component used for row actions elsewhere (Contacts,
  Campaigns, Templates). Two bare always-visible icon buttons read as
  cluttered next to that pattern; a menu on click is the more standard shape
  for "account settings + sign out" in this style of app.
- Verified in-browser (Playwright): login → dashboard → navigate → open user
  menu → logout → direct URL after logout bounces to `/login` → wrong
  password shows the inline red error and does not log in → session survives
  a hard page reload → show/hide password toggle reveals the typed value.
- **Pre-existing lint error found and fixed (2026-08-22), unrelated to login:**
  `frontend/src/app/(app)/campaigns/[id]/page.tsx` called `Date.now()` directly
  in render to keep its scheduling-time suggestion fresh — flagged by
  `react-hooks/purity` (impure call during render), which would have failed
  `next build`. Fixed by moving it into `useState` + a 30s `setInterval` in a
  `useEffect`; the "don't freeze the suggestion at mount" behaviour is
  unchanged. `npx eslint .` and `npx tsc --noEmit` are both clean across the
  frontend as of this fix — not re-verified with a real `next build` yet
  (the dev server was running; building alongside it corrupts `.next` — see
  "Run locally"). Confirm with an actual `next build` once dev is stopped,
  before or during step 3 (Deploy) below.

## ▶️ Recommended next steps (in order) — REORDERED 2026-08-22

**Stop building features. Ship what exists.**

The honest position, agreed with the owner on 2026-08-22: **this app has never sent
one email to one real customer.** The company still runs its mail from WordPress.
Since Phase 1 was declared done we added analytics, scheduling, auto-pause,
edit/delete and segments — all good work, all of it added to something nobody uses.
That is not MVP. The reason deploy was deferred ("SES production access is months
away") **stopped being true today**: the office account already has it.

1. ~~**SES cutover**~~ ✅ **done 2026-08-22** — office key, `us-east-1`,
   `no-reply@innovatesolution.com`, and a real campaign delivered to four inboxes.
2. ~~**Login**~~ ✅ **done 2026-08-22** — email + password, added ahead of this list
   because deploy without it means anyone with the URL reaches real customer data.
   See § "Simple login".
3. ~~**Deploy**~~ ✅ **done 2026-08-24** — docker-compose now runs `db` + `backend` +
   `frontend`; nginx + Let's Encrypt SSL in front. Live at
   `https://mailhub.omarsec.com`. Verified: login, Contacts/Templates/Campaigns/
   Analytics all load with no console errors (checked with Playwright), and a real
   test send through SES succeeded end-to-end (to `success@simulator.amazonses.com`,
   then deleted).
   - ⚠️ **Not the company Linux server — deliberately temporary personal infra.**
     Owner does not want mistakes risking the OVH box that hosts other live ITT
     client projects. Server: a fresh AWS EC2
     `t3.micro` (`Mailhub Server`, personal AWS account, `ap-southeast-1`), SSH
     alias `mailhub-server`, Elastic IP `13.213.171.154` (so the IP survives a
     stop/start — a plain auto-assigned public IP does not). Domain:
     `mailhub.omarsec.com`, a subdomain of the owner's personal `omarsec.com`
     (mid-transfer from Namecheap to Cloudflare Registrar at the time of writing).
     **Both the server and the domain are explicitly throwaway** — moving to the
     company's permanent server/domain later is a known follow-up, not a surprise.
   - **How to ship a change to it** (the repo lives at `/home/ubuntu/mailhub`):
     merge to `main`, then on the server `git pull && docker compose up -d --build`.
     The checkout tracked the `claude/deploy-docker` branch until 2026-08-24 — so a
     plain `git pull` fetched nothing new after that branch merged, which is exactly
     how a deploy silently ships nothing. It tracks **`main`** now; keep it there.
     `prisma migrate deploy` runs on backend start, so a migration needs no extra
     step. Secrets are NOT in git: `.env` and `backend/.env` live only on the server
     (`chmod 600`), and a fresh clone needs them copied over by hand.
   - Docker build note: the Prisma `prisma-client` generator's ESM output uses
     extensionless relative imports, which Node's own ESM loader rejects
     (`ERR_MODULE_NOT_FOUND`) when running plain `tsc`-compiled output. Fix:
     `backend/Dockerfile` runs the server via `npx tsx src/index.ts` (same
     resolver `npm run dev` already relies on) instead of `node dist/index.js`,
     with `tsc --noEmit` kept as a build-time type-check gate so a real type
     error still fails the build instead of shipping silently.
   - `PUBLIC_URL` **must** be the real outside URL, or every unsubscribe / open /
     click link ships broken to real customers. Now set correctly on the deploy
     server; **do not let it drift back to an IP or localhost** on a future
     redeploy or server move.
   - ✅ **Bounce/complaint webhook — done and verified 2026-08-24**, all from §
     "Office AWS SES account" item 2:
     - SNS topic `productupdate-ses-events` + SES configuration set
       `productupdate-config` created in the **office** account (`540002947526`,
       `us-east-1`) — sits alongside the other brands' `Innovate-Email-mailflow`
       and `yourtripdesk-prod` sets, untouched. Event destination: **Hard bounces +
       Complaints** only.
     - Topic access policy has the `AllowSESPublish` statement for
       `ses.amazonaws.com` (the console does not add this automatically — without
       it, sends succeed but nothing ever reaches the topic, with no error).
     - HTTPS subscription to `https://mailhub.omarsec.com/webhooks/ses` created
       and **confirmed** (the `SubscribeURL` only ever appears in the backend log —
       `docker logs mailhub-backend | grep SubscribeURL` — then open that URL).
     - **`SES_CONFIGURATION_SET=productupdate-config`** set in the server's
       `backend/.env`; backend restarted to pick it up.
     - **Verified for real, not assumed:** sent a campaign to
       `bounce@simulator.amazonses.com` through the live app — the contact's
       `status` flipped to `bounced` (a real `Suppression` row), confirming the
       full chain (send → SES bounce → SNS → `/webhooks/ses` → auto-suppress)
       works end-to-end on the office account. Test contact/campaign deleted after
       (the `Suppression` row was deliberately left in place — that's correct
       behavior, see "Editing and deleting" rules in CLAUDE.md).
     - Rehearsed once first in the owner's **personal** AWS account/region
       (`ap-southeast-1`) as a dry run before touching the office account — same
       steps, disposable resources (`practaice-maihub-ses-events` topic,
       `mailhub-practice` set), not connected to real SES sending, since practicing
       first was safer for both the account and their own learning.
4. **One real send** — small and deliberate (10–20 people), from the deployed app.
   This is the finish line the whole project was for.
5. **Leave WordPress** — once step 4 works twice, move the real list over.
6. **Then, and only then, ask what to build next.** After a real send the answer
   comes from use, not from guessing. The likeliest real gap is that **nobody at the
   company can write an email without writing HTML** — a no-code editor beats every
   other backlog item on that evidence, but wait for the evidence.

**Explicitly on hold** (all were "next" before today — none blocks a real send):
saved segments (built, parked — see above) · global search · Teams + RBAC +
approval · multi-brand + preference center · template image upload (R2) ·
`EmailEvent` table. Do the `EmailEvent` table with step 2 only if it is free;
otherwise it waits (FINAL-PLAN.md §6).

### Known bugs in the send loop — found 2026-08-23, deliberately NOT fixed

Two `/code-review` passes over the `SES_CONFIGURATION_SET` change surfaced three
real problems in `src/email/send-campaign.ts`. **Fixes were written and then
reverted at the owner's request** — the owner had asked only for the config-set
wiring, and the send loop is the one file where an unrequested change is least
welcome. **Do not re-apply any of this without asking first.** Recorded so the
next session neither rediscovers them nor treats the current behaviour as
intentional:

1. **A failed send is swallowed.** The `catch` around `sendEmail` records
   `status: "failed"` and logs nothing. One bad setting (dead AWS key, a
   `SES_CONFIGURATION_SET` naming a set that does not exist) fails every recipient
   identically, so an 800-person send ends with 800 `failed` rows and no clue
   anywhere why — and the scheduled worker runs with nobody watching.
2. **Failed recipients can never be reached.** The exactly-once check skips any
   existing `CampaignRecipient` row *regardless of status*, so after fixing the
   cause a re-send reports "already sent" and emails nobody. The fix has a real
   subtlety: retry `failed` but never `sending`, because the row is written
   *before* the SES call, so a `sending` row may already be in someone's inbox.
3. **No brake on wholesale failure.** The 200ms pacing sleep sits on the success
   path only, and there is no give-up rule, so a broken setting fires one
   SendEmail per contact with no gap — hundreds of rejected calls per second
   against a shared live AWS account.

Two smaller notes from the same review, for whoever does fix these: log the
recipient **row id**, not the email address (one bad setting fails every send, so
addresses would put the whole customer list in the log file), and if the
post-send DB update fails, leave the row at `sending` rather than marking it
`failed` — `sending` counts as delivered everywhere else, which is what stops a
re-send from mailing that person twice.

None of this blocks deploy. It bites on the **first real send**, which is
step 4 — worth raising with the owner then.

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
- **Saved segments** — ✅ **built, then PARKED on branch `claude/saved-segments`**
  (commit `7b5f767`), because the owner does not segment at all. Details and the
  "when to revive" test are in the 2026-08-22 section above. **Do not rebuild it.**
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
