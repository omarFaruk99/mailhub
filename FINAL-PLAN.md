# Email Marketing System — চূড়ান্ত প্ল্যান (Final Plan)

> নিজস্ব multi-brand Email Marketing সফটওয়্যার। পাঠানোর ইঞ্জিন: **Amazon SES**।
> এক প্রতিষ্ঠান → অনেক brand/product → প্রতি brand-এ অনেক team।
> বড় কোম্পানির (Mailchimp / HubSpot / SendGrid) মানের কাঠামো।

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
- Brand + Sender identity (domain, DKIM, SPF, DMARC)
- Contact (এক ইমেইল = এক record) + CSV import
- Campaign type + একটি broadcast (filter সহ) SES দিয়ে পাঠানো
- Unsubscribe + **one-click unsubscribe (RFC 8058)** + suppression
- Bounce/complaint webhook (**SNS signature verify**) + **auto-pause**
- **Exactly-once sending**
- বেসিক open/click tracking

**Phase 2 — Team ও পেশাদার রূপ**
- Multi-team + RBAC role
- Approval workflow
- Drag-and-drop template editor + per-team library + brand kit
- Filter + Saved Segment
- Scheduling + timezone
- Analytics dashboard

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
- SES শুরুতে **sandbox** → domain verify → **production access** নিন।
- **DKIM অবশ্যই** চালু; নতুন domain → **warm-up**।
- **Marketing ও transactional আলাদা subdomain** থেকে পাঠান।
- **Bounce < ৫%**, **complaint < ০.১%** রাখুন; নইলে SES বন্ধ করতে পারে।
- Contact ডুপ্লিকেট নয় (প্রতি brand-এ এক ইমেইল = এক record)।
- Campaign type ছোট রাখুন (৫–৭টা)।
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
- **Contact** — এক ইমেইল = এক record (প্রতি brand)
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
- SES sandbox-এ verified ইমেইলে টেস্ট মেইল।
- Test campaign → filter ঠিক লোক বাছছে; open/click ট্র্যাক আসছে।
- SES simulator `bounce@simulator.amazonses.com` → suppression কাজ করছে।
- Unsubscribe ও preference → পুনরায় মেইল বন্ধ হচ্ছে।
- দুই brand আলাদা → Tripgic-এর মেইল Innovate-কে ছোঁয় না, যাচাই।
- Approval ছাড়া campaign পাঠানো যায় না, যাচাই।
