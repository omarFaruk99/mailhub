# Email Marketing System — চূড়ান্ত প্ল্যান (Final Plan)

> নিজস্ব multi-brand Email Marketing সফটওয়্যার। পাঠানোর ইঞ্জিন: **Amazon SES**।
> এক প্রতিষ্ঠান → অনেক brand/product → প্রতি brand-এ অনেক team।
> বড় কোম্পানির (Mailchimp / HubSpot / SendGrid) মানের কাঠামো।
>
> 📌 **আমাদের নিজের SES অবস্থা (কোন account, কোন region, কোন domain verified) →
> [PROGRESS.md](PROGRESS.md)।** পুরনো EMAIL-GUIDE.md মালিক ইচ্ছাকৃতভাবে মুছেছেন
> (2026-08-22)। তার সাথে **WordPress → MailHub হস্তান্তরের checklist-ও চলে গেছে** —
> এখন সেটা কোথাও নেই। "WordPress ছাড়া" এখন প্ল্যানের ধাপ ৪, তাই deploy-এর সময়
> checklist-টা নতুন করে লিখতে হবে (PROGRESS.md § Recommended next steps)।

---

## ১. Context (কেন এই সিস্টেম)

আমরা একটি সফটওয়্যার কোম্পানি, সারা বিশ্বে **একাধিক আলাদা product** বিক্রি করি
(Innovate Solution, Tripgic, Tripmargin ...)। প্রতিটি product আলাদা brand — আলাদা
domain, আলাদা client base।

**এখন যেভাবে করছি (উদাহরণ: Innovate):**
| কে | কী পাঠায় | template |
|----|---------|----------|
| Product/Tech টিম | new feature, bug fix, update | নিজের template |
| Marketing টিম | promotion, campaign | নিজের template |

দুই টিমই একই Innovate client-দের, একই domain থেকে পাঠায় — শুধু ধরন ও template আলাদা।

**যা চাই:** সব product-এর জন্য এক সিস্টেম, বড় কোম্পানির মতো — যেখানে অনেক brand,
প্রতি brand-এ অনেক team (product, marketing, support, sales...), role, approval,
আর পরিষ্কার রিপোর্ট থাকবে।

---

## ২. মূল কাঠামো (Hierarchy) — এটাই ভিত্তি

```
Organization (আপনার প্রতিষ্ঠান)
│
├── Brand: Innovate      (innovatesolution.com | নিজের client, reputation, sender)
│     ├── Teams: Product, Marketing, Support, Sales ...
│     ├── Contacts (এই brand-এর client)
│     ├── Templates (brand kit + প্রতি team-এর library)
│     └── Campaigns
│
├── Brand: Tripgic       (tripgic.com | সম্পূর্ণ আলাদা)
│     └── ... (নিজের সব)
│
└── Brand: Tripmargin    (... | সম্পূর্ণ আলাদা)
```

**নিয়ম:**
- **Brand সম্পূর্ণ আলাদা** — client, template, campaign, reputation আলাদা।
- **এক ইমেইল = এক contact, প্রতি brand-এ** (brand আলাদা তাই আলাদা record — এটা সঠিক)।
- Unsubscribe/suppression হয় **brand অনুযায়ী** (আইনসম্মত)।
- এক brand-এর সমস্যা অন্য brand-এর ক্ষতি করে না ✅
- **এক brand-এর ভেতরে সব team একই client list শেয়ার করে** — team/type/tag দিয়ে আলাদা করে দেখে।

---

## ৩. Team — শুধু দুই নয়, যত দরকার (scalable)

সিস্টেমে team সংখ্যা নির্দিষ্ট থাকবে না — নতুন team যোগ করা যাবে। বড় কোম্পানি সাধারণত
যে team রাখে (আপনি চাইলে সব বা কিছু):

| Team | সাধারণত যা পাঠায় | Campaign type |
|------|------------------|---------------|
| **Product / Engineering** | নতুন ফিচার, bug fix, release note, maintenance notice | product update |
| **Marketing** | promotion, offer, newsletter, event | marketing |
| **Customer Success / Support** | onboarding, tips, how-to, survey | lifecycle |
| **Sales** | trial follow-up, upsell, win-back | sales |
| **Billing / Finance** | invoice, payment reminder, receipt | transactional |

- প্রতি team-এর **নিজস্ব template library**।
- brand-level **shared template + brand kit** (logo, রং, footer) — সবাই এক চেহারায় থাকে।

---

## ৪. Role ও Permission (বড় কোম্পানি যেভাবে করে — RBAC)

> ✅ **২০২৬-০৮-২২: Simple login হয়ে গেছে** (email + password, সবাই `role=admin`) —
> deploy-এর আগে একটা security প্রয়োজন ছিল, feature কাজ না। বিস্তারিত:
> PROGRESS.md § "Simple login". `User` টেবিলে `role` ফিল্ড **এখনই আছে**, তাই নিচের
> পুরো RBAC পরে বানালে এই টেবিল থেকেই শুরু হবে — নতুন করে User বানাতে হবে না।

| Role | কী পারে |
|------|---------|
| **Org Admin** (super) | সব brand, সব কিছু নিয়ন্ত্রণ |
| **Brand Admin** | এক brand-এর সব; team ও user ম্যানেজ |
| **Team Manager** | নিজ team-এর কাজ ও **approval** |
| **Editor / Creator** | campaign ও template বানায় (পাঠাতে approval লাগে) |
| **Analyst / Viewer** | শুধু রিপোর্ট দেখে |

---

## ৫. Approval Workflow (বড় কোম্পানির গুরুত্বপূর্ণ নিয়ম)

বড় কোম্পানিতে কেউ সরাসরি হাজার client-কে মেইল পাঠাতে পারে না। ধাপ:

```
Draft (তৈরি) → Review (পরীক্ষা) → Approve (অনুমোদন) → Schedule/Send (পাঠানো)
```

- ভুল মেইল, ভুল লিংক, ভুল লোককে পাঠানো — এতে বন্ধ হয়।
- কে অনুমোদন করল সব **audit log**-এ থাকে।

---

## ৬. পাঠানো ও Deliverability (Amazon SES)

| বিষয় | কীভাবে |
|------|--------|
| প্রতি brand = আলাদা **sender identity** | নিজের domain, from-নাম, from-ইমেইল, reply-to |
| প্রতি domain SES-এ আলাদা **verify** | নিজস্ব **DKIM, SPF, DMARC** |
| **Marketing ও Transactional আলাদা subdomain** | যেমন `news.brand.com` (marketing) ও `mail.brand.com` (transactional)। reputation রক্ষা |
| Queue + **rate limit** | SES সীমা মেনে ধীরে পাঠানো |
| **Bounce ও complaint** স্বয়ংক্রিয় | SES → SNS → webhook → suppression |
| Hard vs Soft bounce | Hard = সাথে সাথে suppress; Soft = কয়েকবার চেষ্টা |
| প্রতি নতুন domain | **warm-up** — অল্প অল্প করে volume বাড়ানো |
| **SNS webhook signature verify** | ভুয়া bounce event ঢোকানো ঠেকায় (security) |
| **Exactly-once sending** | worker crash করলেও একজন একবারই মেইল পায় |
| **Branded tracking domain** (`click.brand.com`) — unsubscribe/open/click লিংক নিজের subdomain দিয়ে যাবে, raw backend ডোমেইনের বদলে | **সবার শেষে করব** — জরুরি না, marketing/transactional subdomain সেটাপের সাথেই একসাথে করা যাবে (বাড়তি খরচ/কাজ প্রায় শূন্য) |
| **`EmailEvent` টেবিল (ভবিষ্যতে)** — এখন প্রতিটা ঘটনা আলাদা করে রাখা হয় না: recipient row-তে শুধু **প্রথম** open/click-এর সময় থাকে, আর `Suppression` হলো *অবস্থা* (প্রতি ইমেইলে এক row), *ঘটনার লিস্ট* নয়। তাই bounce/complaint হার শুধু **সারাজীবনের** হিসাব করা যায়, "গত ৩০ দিনের" নয়। | **SES production-এর সময় করব** — তখন SES delivery/open/click/bounce event পাঠাবে; প্রতি ঘটনা আলাদা row-তে রাখলে rolling bounce/complaint rate, unique vs total open, device/country — সব সম্ভব হবে। |
| **Failed-send retry (ভবিষ্যতে)** — কোনো মেইল `failed` হলে (নেটওয়ার্ক/SES সমস্যায় *যেতেই পারল না* — bounce নয়) এখন তার recipient-row তৈরি হয়ে যায়, আর exactly-once নিয়মে সেটা আর retry হয় না; send পেজ "Sent" দেখায়। | **SES production-এর সময় করব** — failed recipient আলাদা করে চেনা ও **শুধু ওগুলো** আবার পাঠানোর ("Retry failed") সুযোগ যোগ করতে হবে (ডুপ্লিকেট ছাড়া)। এখন verified টেস্ট ইমেইলে পাঠানো হয় বলে জরুরি না। |

### ২০২৬ Bulk Sender নিয়ম (Google / Yahoo / Microsoft)
> **নোট:** "bulk sender" = দিনে ৫,০০০+ মেইল। আপনার volume (৭০০–৮০০ একসাথে, মাসে
> ৮–১০ হাজার) এর **নিচে**। তবু এই নিয়মগুলো **মানা উচিত** — সস্তা, আর inbox-এ
> পৌঁছানো নিশ্চিত করে। ভবিষ্যতে volume বাড়লে এমনিতেই তৈরি থাকবেন।
- **SPF + DKIM + DMARC** — তিনটাই থাকতে হবে ও aligned।
- **One-click unsubscribe (RFC 8058)** — এক ক্লিকে unsubscribe, **২ দিনের মধ্যে** কার্যকর।
- **Spam complaint rate < ০.৩%** (লক্ষ্য ০.১% এর নিচে)।
- **Auto-pause (circuit breaker)** — complaint/bounce হঠাৎ বাড়লে সিস্টেম নিজে পাঠানো
  থামাবে → SES ও reputation রক্ষা।

---

## ৭. পূর্ণ ফিচার তালিকা

### Contact / Audience (প্রতি brand-এ)
- Contact + custom field (নাম, কোম্পানি, দেশ, ভাষা, plan)
- CSV import **+ API auto-sync** (আপনার app/billing থেকে — standard)
- **Filter** — team, country, client type, tag, status, date, activity
- **Saved Segment** — শর্ত সেভ করে বারবার ব্যবহার
- Tag
- Double opt-in
- **Suppression list** (ইমেইল ধরে, স্বয়ংক্রিয়)
- **Sunset policy** — অনেকদিন না খুললে বন্ধ (list hygiene)

### Email তৈরি
- **Drag-and-drop template editor**
- প্রতি team-এর library + brand kit (shared)
- Personalization / merge tag — "Hi {{name}}"
- Dynamic content, HTML + Plain text
- **ছবি** → Cloudflare R2-এ রাখা, HTML-এ link দিয়ে বসানো (screenshot ইত্যাদি)
- **ফাইল** → সাধারণত download link (R2); ছোট দরকারি ফাইল হলে সত্যিকারের attachment
- A/B testing (subject/content)
- Test send + mobile/desktop preview + spam-score check
- **Preheader / preview text** (inbox-এ subject-এর পাশে যে ছোট লেখা দেখায়) —
  **optional/future**; এটা template editor-এর অংশ, send স্ক্রিনের না
- **Undo send** (পাঠানোর পর ৩০ সেকেন্ড ফেরানোর সুযোগ, Gmail-এর মতো) —
  **optional/future**; এখন confirm popup দিয়েই ভুল ঠেকানো হচ্ছে

### Campaign
- **Category (client দেখে ও preference-এ বেছে নেয়):**
  Product updates · Marketing/Offers · Tips & Onboarding · Transactional
- **Label (শুধু টিমের গোছানো ও রিপোর্ট — client দেখে না):**
  Product updates → new feature / bug fix / maintenance; Marketing → promo / newsletter
- **Broadcast** — নির্দিষ্ট filter-এর সবাইকে
- **Automation / Drip** — welcome series, onboarding
- **Triggered** — সাইন-আপ, কেনা, রিনিউ অনুযায়ী
- **Transactional** — receipt, password, license
- Scheduling — client-এর **timezone** অনুযায়ী

### Preference Center (client নিজে ঠিক করে)
- Client বেছে নেবে সে কোন **Category** চায় (Product updates চাই, Marketing চাই না — ইত্যাদি)।
- Category-তে পছন্দ (ছোট label না) — সহজ, বড় কোম্পানির মতো।
- ফলে পুরো unsubscribe কমে; দুই team একই লোককে বিরক্ত করে না।

### Tracking ও Analytics
- Open, click, delivery, bounce, complaint, unsubscribe rate
- Device / country / email-client
- **Team, Campaign type ও Brand অনুযায়ী রিপোর্ট**
- Dashboard + ডাউনলোডযোগ্য রিপোর্ট
- **Google Postmaster Tools** দিয়ে reputation নজরদারি
- **Contact activity timeline** — একজন contact-এর প্রোফাইল পেজে তার সব মেইল ইতিহাস
  (কী পাঠানো হয়েছে, খুলেছে কিনা, ক্লিক করেছে কিনা) এক জায়গায় দেখা যাবে (Phase 2)

### Compliance (আইন — বাধ্যতামূলক)
- প্রতি মেইলে **Unsubscribe লিংক** + **One-click unsubscribe header (RFC 8058)**
- Preference center
- GDPR ও CAN-SPAM + consent log
- Complaint rate নজরদারি + **auto-pause** (থ্রেশহোল্ড ছাড়ালে থামা)

### Admin
- Multi-brand, multi-team, **RBAC role**
- **Approval workflow**
- Public **API**
- **Audit log** (কে কী করল)
- **Test/Staging** আলাদা — কখনো আসল client-এ পরীক্ষা নয়

---

## ৮. বাস্তব দৃশ্যপট (Scenarios)

1. **Product update (Innovate)** → Product টিম draft → Manager approve → filter
   "Innovate + update চায়" → SES (news.innovatesolution.com) থেকে পাঠানো → ট্র্যাক।
2. **Promotion (Innovate Marketing)** → Marketing টিম, নিজের template → A/B subject →
   schedule → পাঠানো।
3. **Tripgic campaign** → সম্পূর্ণ আলাদা brand, tripgic.com থেকে, Innovate-কে ছোঁয় না।
4. **Welcome series** → নতুন client → স্বয়ংক্রিয় ৩ মেইল (দিন ০, ২, ৫)।
5. **Renewal reminder** → লাইসেন্স শেষের ৭ দিন আগে triggered।
6. **Bounce/Complaint** → SES জানায় → suppression → reputation রক্ষা।
7. **Preference** → client শুধু "bug fix" রাখে → promotion আর যায় না।

---

## ৯. চূড়ান্ত Tech Stack

| স্তর | প্রযুক্তি | নোট |
|------|----------|------|
| Frontend | **Next.js + shadcn/ui + Tailwind CSS** | নিজের Linux server-এ host |
| Backend | **Express (Node.js)** | নিজের Linux server-এ host |
| Database | **PostgreSQL** (নিজের Linux server-এ) | Supabase না — বাড়তি খরচ ও সীমা নেই |
| Queue | **pg-boss** (PostgreSQL-এই চলে) | আলাদা Redis লাগবে না |
| ফাইল/ছবি | **Cloudflare R2** | egress ফ্রি + CDN; অফিসে Cloudflare আছে |
| পাঠানো | **Amazon SES** | অফিসে আছে |
| Event | SES → SNS → Webhook | bounce/complaint/open/click |
| DB দেখা | pgAdmin (ফ্রি টুল) | database দেখা ও ম্যানেজ |

**সব এক Linux server-এ:**
```
Linux Server:  Next.js (frontend) + Express (backend) + PostgreSQL + pg-boss (queue)
বাইরে:         Cloudflare R2 (ফাইল)  +  AWS SES (পাঠানো)
```

**খরচ:** Linux server ও Cloudflare আপনার আছে → বাড়তি খরচ প্রায় **$০**।
SES-এ ~$০.১ প্রতি হাজার মেইল (নগণ্য)।

**নিজে চালানোর দায়িত্ব (আমি সেটআপ করে দেব):**
- রোজ স্বয়ংক্রিয় **database backup**।
- মাঝে মাঝে নিরাপত্তা **আপডেট**।

### ভবিষ্যতে আরও smooth/advanced করতে (এখন দরকার নেই)
- **Redis + BullMQ** — volume অনেক বাড়লে queue দ্রুত ও শক্তিশালী হয়।
- **Managed PostgreSQL** (Supabase paid / AWS RDS / Neon) — server ঝামেলা কমাতে, auto-backup।
- **Docker** — deploy সহজ ও একরকম রাখতে।
- **Load balancer + একাধিক server** — client/volume অনেক বাড়লে।
- **Monitoring** (Grafana/Sentry) — সমস্যা আগে ধরার জন্য।
- **CI/CD** — কোড আপডেট স্বয়ংক্রিয়ভাবে deploy।

---

## ১০. ধাপে ধাপে বানানোর প্ল্যান (Phase)

**Phase 1 — MVP (এক brand দিয়ে শুরু, যেমন Innovate)** — ✅ **সম্পন্ন (local dev)**; বিস্তারিত [PROGRESS.md](PROGRESS.md)
- Brand + Sender identity — অফিস account-এ `innovatesolution.com` / `tripgic.com` / `tripmargin.com` **DKIM ✅ verified** (us-east-1, production)। **SPF + DMARC এখনো বাকি**, আর custom MAIL FROM কোনোটাতেই সেট করা নেই — deploy-এর সময় করতে হবে (তখন SPF বাধ্যতামূলক হয়ে যায়)
- Contact (এক ইমেইল = এক record) + CSV import
- Campaign type + একটি broadcast (filter সহ) SES দিয়ে পাঠানো
- Unsubscribe + **one-click unsubscribe (RFC 8058)** + per-contact suppression
- Bounce/complaint webhook (**SNS signature verify**) → auto-suppress
- ~~**Auto-pause (brand-level circuit breaker)**~~ ✅ **সম্পন্ন** — bounce/complaint
  হার বাড়লে ওই brand-এর পাঠানো নিজে থেকে বন্ধ; শুধু মানুষ আবার চালু করতে পারে
  (auto-resume কখনো নয়)। সীমা ইচ্ছে করেই **target-এর চেয়ে ঢিলা** — bounce ৫%,
  complaint **০.৩%** (Gmail/Yahoo যেখানে সত্যিই শাস্তি দেয়); ০.১% target-এ ৮০০ জনের
  send-এ **একটা** complaint-ই সব বন্ধ করে দিত। বিস্তারিত: PROGRESS.md।
- **Exactly-once sending**
- বেসিক open/click tracking

**Phase 1.5 — দৈনন্দিন ব্যবহারের কাজ** ✅ **সম্পন্ন** (PR #14)
- Campaign ও Contact **edit/delete** (আগে বানানোর পর বদলানোই যেত না)
- নিয়ম: **কেউ মেইল পেয়ে গেলে** campaign-এর subject/লেখা আর বদলানো যায় না; নাম বদলানো যায়
- Contact-এর **status** কখনো হাতে বদলানো যায় না; unsubscribe করা কারো **ঠিকানাও** নয়
- Contact মুছলেও তার **block থেকে যায়** (নইলে delete-ই unsubscribe বাতিলের উপায় হতো)
- Plan ও Country এখন **তালিকা থেকে বাছাই** — `Paid`/`paid` আলাদা হয়ে filter ভাঙা বন্ধ

**Phase 2 — Team ও পেশাদার রূপ**
- Multi-team + RBAC role
- Approval workflow
- Drag-and-drop template editor + per-team library + brand kit
- Filter + Saved Segment
- ~~Scheduling + timezone~~ ✅ **সম্পন্ন** (pg-boss; PROGRESS.md দেখুন)
- ~~Analytics dashboard~~ ✅ **সম্পন্ন** + **contact activity timeline** (বাকি)

**Phase 3 — Multi-brand ও Preference**
- একাধিক brand (Tripgic, Tripmargin...) যোগ
- Preference center (per-type)
- Drip / welcome series + triggered + transactional
- A/B testing

**Phase 4 — স্কেল ও অটোমেশন**
- API auto-sync (app/billing থেকে contact)
- Email verification / list cleaning + sunset policy
- Postmaster Tools নজরদারি
- Advanced deliverability

---

## ১১. গুরুত্বপূর্ণ সাজেশন (আমার)
- এক brand (Innovate) দিয়ে শুরু করুন — কাজ করলে বাকিগুলো সহজে যোগ হবে।
- ~~SES শুরুতে **sandbox** → domain verify → **production access** নিন।~~ ✅ **হয়ে গেছে** — অফিস account-এ us-east-1-এ production access আগেই ছিল (2026-08-22)। ⚠️ `ap-southeast-1` ব্যবহার করবেন না, ওখানে account বন্ধ।
- **DKIM অবশ্যই** চালু; নতুন domain → **warm-up**।
- **Marketing ও transactional আলাদা subdomain** থেকে পাঠান।
- **Bounce < ৫%**, **complaint < ০.১%** রাখুন; নইলে SES বন্ধ করতে পারে।
- Contact ডুপ্লিকেট নয় (প্রতি brand-এ এক ইমেইল = এক record)।
- **মালিকের সিদ্ধান্ত — consent gate নেই:** মালিকের দেওয়া লিস্টে (client/prospect/staff)
  আগে অনুমতি নেওয়ার ধাপ ছাড়াই মেইল পাঠানো হবে (import = subscribed)। নিরাপত্তা আসবে
  unsubscribe + suppression + **auto-pause** থেকে, "কাকে পাঠাব" আটকে নয়। (সেরা চর্চা
  হলো শুধু consented লিস্ট — এটা মালিকের স্পষ্ট override, তাই guardrail কড়া রাখতে হবে।)
- Campaign type ছোট রাখুন (৫–৭টা)।
- **Category দেখে audience আগে থেকে টিক থাকা — রাখার সিদ্ধান্ত (২৮ জুলাই ২০২৬)।**
  বড় টুল (Mailchimp / Brevo / Klaviyo) কিছুই আগে থেকে টিক করে না — কিন্তু তাদের শত শত
  লিস্ট আর রোজ নতুন কর্মী। আমাদের ক্ষেত্রে নিয়মটাই **কোম্পানির নীতি**, সপ্তাহে ২–৩টা
  send, আর পাঠানোর আগে confirm পপ-আপ audience ও সংখ্যা দেখায়। **Teams + RBAC আসার সময়
  আবার ভাবতে হবে** — যে Editor নীতি জানে না, তার জন্য উত্তর বদলে যেতে পারে (তখন সম্ভাব্য
  পরিবর্তন: `internal` আর আগে থেকে টিক না করা)। পরে বদলানো সহজ — দুটো ৫ লাইনের ফাংশন,
  migration লাগে না, আর আগে থেকে schedule করা send-এ প্রভাব পড়ে না (তার audience
  `Campaign.sendOptions`-এ জমা থাকে)।
- **আমাদের বনাম বড় কোম্পানি — সেই ফাঁকটা এখন বন্ধ:** তারা bounce/complaint বাড়লে
  নিজে থেকে পাঠানো থামায়; **আমাদেরও এখন auto-pause আছে** ✅। consent gate না রাখার
  সিদ্ধান্তের কারণে এটাই প্রধান রক্ষাকবচ।
- এখন **dedicated IP লাগবে না** — SES shared IP দিয়ে শুরু (দিনে ১ লাখ+ নিয়মিত হলে ভাবুন)।

**ভবিষ্যতের জন্য টুকে রাখা (এখন বানাব না):**
- Group / cross-brand campaign (mother company নাম থেকে সব brand-এ dedupe করে পাঠানো) —
  **পরে** যোগ করা হবে।
- এখন **group consent নেওয়া হচ্ছে না**। তাই ভবিষ্যতে group মেইল পাঠাতে চাইলে
  **তখন নতুন করে consent নিতে হবে** — নইলে পাঠানো যাবে না।

---

## ১২. ডেটা কাঠামোর সারসংক্ষেপ (মূল টেবিল)
- **Organization** — মূল প্রতিষ্ঠান
- **Brand** — product/brand + sender identity (domain, DKIM)
- **Team** — brand-এর ভেতরের team
- **User** + **Role** — RBAC
- **Contact** — এক ইমেইল = এক record (প্রতি brand)। ফিল্ড: `type`
  (`client`/`prospect`/`internal` — internal = নিজের কলিগ), `company` (বাইরের
  কোম্পানির নাম, শুধু filter-এর জন্য; internal/individual-এ খালি), country, plan, status।
  আলাদা Company entity নেই — `company` শুধু একটা filter field।
- **Tag**, **Segment** — ভাগ ও filter
- **Template** — team library + brand kit
- **Campaign** — type, filter, approval status
- **CampaignRecipient** — কে পেয়েছে
- **EmailEvent** — open/click/bounce/complaint/unsubscribe
- **Suppression** — যাদের আর মেইল যাবে না (brand অনুযায়ী)
- **Preference** — client-এর per-type পছন্দ
- **AuditLog** — কে কী করল

---

## ১৩. যাচাই (Verification)
- ✅ টেস্ট মেইল হয়েছে (2026-08-22) — মালিকের ৪টা inbox-এ, DKIM signed। **sandbox আর নেই**, তাই টেস্ট করতে হবে SES simulator address-এ (`success@`/`bounce@`/`complaint@simulator.amazonses.com`) বা নিজের inbox-এ। ভুয়া address (`@example.com`) কখনো নয় — production-এ ওটা আসল bounce।
- Test campaign → filter ঠিক লোক বাছছে; open/click ট্র্যাক আসছে।
- SES simulator `bounce@simulator.amazonses.com` → suppression কাজ করছে।
- Unsubscribe ও preference → পুনরায় মেইল বন্ধ হচ্ছে।
- দুই brand আলাদা → Tripgic-এর মেইল Innovate-কে ছোঁয় না, যাচাই।
- Approval ছাড়া campaign পাঠানো যায় না, যাচাই।
