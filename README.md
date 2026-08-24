# MailHub

**Innovate Solution**-এর নিজস্ব (self-hosted), multi-brand email marketing platform।

MailHub দিয়ে কোম্পানির কয়েকটি আলাদা brand-এর (Tripgic, Tripmargin, ভবিষ্যতে আরও)
client-দের কাছে product update, নতুন feature, bug fix আর promotion পাঠানো হয়। প্রতিটি brand-এর নিজের contact list, নিজের sender
identity আর নিজের sending reputation আলাদা থাকে — তাই এক brand-এর সমস্যা অন্য
brand-কে কখনো প্রভাবিত করে না।

এটা WordPress থেকে হাতে হাতে campaign পাঠানোর জায়গা নিয়েছে, আর চলে কোম্পানির
নিজের নিয়ন্ত্রণে থাকা server-এ — তাই খরচ শুধু একটা server আর Amazon SES, প্রতি
contact-এর জন্য মাসিক subscription নয়।

**অবস্থা:** Phase 1 (MVP) সম্পূর্ণ, deploy করা হয়েছে। Live:
**https://mailhub.omarsec.com** (সাময়িক infrastructure — নিচে
[Deployment](#deployment) দেখুন)।

---

## কী কী কাজ করে

| বিষয় | যা কাজ করে |
| --- | --- |
| **Contacts** | Add, edit, delete, CSV import (Papa Parse)। নিয়ম: এক brand-এ এক email = এক contact। প্রতিটি contact-এর একটা **type** থাকে — `client` / `prospect` / `internal` — সাথে filter করার জন্য plan, country আর company। |
| **Templates** | সংরক্ষিত email design (নাম, subject, category, HTML)। নতুন brand বানালেই কিছু ready-made starter design নিজে থেকে ঢুকে যায়। `{{name}}` merge tag প্রতিটি recipient-এর নাম দিয়ে বদলে যায়। |
| **Campaigns** | Create, edit, duplicate, delete। Filter (plan / country / company / contact type) দিয়ে audience বেছে পাঠানো যায়, আর পাঠানোর আগেই "N জন এটা পাবে" সংখ্যাটা দেখা যায়। |
| **Scheduling** | এখনই পাঠান, বা পরে পাঠানোর সময় ঠিক করে দিন (যেকোনো timezone-এ)। Job গুলো PostgreSQL-এর ভেতরে pg-boss দিয়ে রাখা, তাই server restart হলেও scheduled send হারায় না। |
| **Exactly-once sending** | `(campaign, contact)` জোড়াটা unique — তাই retry, crash, বা "Send now" আর scheduled job একসাথে চললেও **একজন কখনো দুইবার ইমেইল পাবে না**। |
| **Unsubscribe ও suppression** | Unsubscribe link, সাথে one-click `List-Unsubscribe` header (RFC 8058)। Suppression প্রতি brand-এ আলাদা এবং **email address ধরে** রাখা হয় — তাই contact মুছে ফেললেও বা পরে আবার CSV import করলেও সে আর ইমেইল পাবে না। |
| **Bounce ও complaint handling** | SES → SNS → `/webhooks/ses` (SNS signature যাচাই করা হয়)। Hard bounce বা spam complaint হলে ওই address স্বয়ংক্রিয়ভাবে suppress হয়ে যায়, আর auto-pause আবার পরীক্ষা করা হয়। |
| **Auto-pause** | প্রতি brand-এর জন্য একটা emergency brake। Bounce বা complaint বেড়ে গেলে পাঠানো নিজে থেকে বন্ধ হয়ে যায়, আর **শুধু মানুষ** সেটা আবার চালু করতে পারে। |
| **Tracking** | Open pixel আর click redirect। Click route শুধু সেই link-এ পাঠায় যেটা ওই recipient-কে পাঠানো campaign-এ সত্যিই ছিল। |
| **Analytics** | Dashboard আর analytics screen: sent / opened / clicked / bounced, সাথে deliverability-র target। |
| **Test send** | সবাইকে পাঠানোর **আগে** নিজের কাছে একটা আসল copy পাঠিয়ে দেখা যায় (subject-এ `[TEST]` লেখা থাকে)। Suppression আর auto-pause এখানেও মানা হয়, আর এর unsubscribe link শুধু preview দেখায় — কিছু বদলায় না। |
| **Login** | Email + password, session PostgreSQL-এ রাখা। প্রতিটা route by default সুরক্ষিত। |

---

## Tech stack

| স্তর | যা ব্যবহার করা হয়েছে |
| --- | --- |
| Language | TypeScript (frontend + backend দুটোই) |
| Frontend | Next.js, Tailwind CSS, shadcn/ui, TanStack Query |
| Backend | Express (Node.js) |
| Database | PostgreSQL |
| ORM ও migration | Prisma |
| Job queue | pg-boss (PostgreSQL-এর ভেতরেই চলে — Redis লাগে না) |
| Input validation | Zod |
| Email পাঠানো | Amazon SES (`@aws-sdk/client-sesv2`) |
| Delivery event | SES → SNS → HTTPS webhook |
| Deployment | Docker Compose + nginx + Let's Encrypt |

ইচ্ছাকৃতভাবে **ব্যবহার করা হয়নি**: Supabase, AWS RDS, Redis। Login/auth নিজেরা
বানানো। কোনটা কেন বেছে নেওয়া হয়েছে — [FINAL-PLAN.md](FINAL-PLAN.md) দেখুন।

---

## একটা send কীভাবে কাজ করে

**পাঠানোর সময়**

1. Campaign page-এ audience বেছে নেওয়া হয়, আর কতজন পাবে সেটা confirm করা হয়।
2. `POST /campaigns/:id/send` একটাই conditional write দিয়ে campaign-টা "claim"
   করে — তাই একই campaign-এর উপর দ্বিতীয় send শুরু হতে পারে না।
3. প্রতিটি contact-এর জন্য send loop: suppressed address বাদ দেয় → exactly-once
   recipient record লেখে → merge tag বদলায় → প্রতিটি link `/track/click`-এর
   মধ্য দিয়ে ঘুরিয়ে দেয় → unsubscribe footer আর open pixel জুড়ে দেয় → SES-কে
   ডাকে, সাথে configuration set-এর নাম বলে দেয় (যেটা delivery event আমাদের
   কাছে ফিরিয়ে আনে)।
4. প্রতি ২৫ জন recipient পর auto-pause আবার পরীক্ষা করা হয় — কারণ লম্বা send
   চলার মাঝপথেই bounce-এর খবর আসতে পারে।

**Delivery event (bounce / complaint)**

SES hard bounce আর complaint একটা SNS topic-এ পাঠায়, সেখান থেকে সেটা
`/webhooks/ses`-এ আসে। Signature যাচাই হয়, address suppress হয়, আর auto-pause
আবার হিসাব করা হয়।

**Tracking**

`/track/open` — খোলা হয়েছে কিনা রেকর্ড করে। `/track/click` — redirect করার আগে
যাচাই করে যে ঠিকানাটা সত্যিই ওই campaign-এর সংরক্ষিত HTML-এ ছিল, যাতে আমাদের
sending domain কখনো open redirect হিসেবে ব্যবহার করা না যায়।

---

## শুরু করা (Getting started)

### যা লাগবে

- **Node.js 20+** (Docker image-এ Node 24 ব্যবহার হয়)
- **Docker Desktop** — local-এ PostgreSQL চালানোর জন্য
- একটা **Amazon SES** access key (যদি সত্যিই ইমেইল পাঠাতে চান)

### Setup

```bash
git clone git@github.com:omarFaruk99/mailhub.git
cd mailhub

# ১. Secrets — example ফাইল copy করে আসল value বসান
cp .env.example .env                  # docker compose এটা পড়ে
cp backend/.env.example backend/.env  # backend এটা পড়ে

# ২. Dependencies
cd backend  && npm install && cd ..
cd frontend && npm install && cd ..

# ৩. Database
docker compose up -d db
cd backend && npx prisma migrate deploy && cd ..

# ৪. একটা login account (নতুন database-এ কোনো account থাকে না)
cd backend
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='একটা-শক্তিশালী-password' \
  npx tsx src/scripts/seed-admin.ts
cd ..
```

### চালানো

```bash
docker compose up -d db            # PostgreSQL
cd backend  && npm run dev         # API → http://localhost:4000
cd frontend && npm run dev         # UI  → http://localhost:3000
```

তারপর http://localhost:3000 খুলে উপরে বানানো account দিয়ে login করুন।

### দরকারি command

| Command | কোথা থেকে | কী করে |
| --- | --- | --- |
| `npm run dev` | `backend/`, `frontend/` | Hot reload দিয়ে চালু করে |
| `npm run build` | `backend/`, `frontend/` | Production build |
| `npm run prisma:studio` | `backend/` | Database-এর data দেখা/বদলানোর GUI |
| `npm run prisma:migrate` | `backend/` | নতুন migration বানায় ও চালায় |
| `npm run lint` | `frontend/` | ESLint |

> ⚠️ **`npm run dev` চলা অবস্থায় কখনো `npm run build` চালাবেন না** (`frontend/`-এ)।
> দুটোই একই `.next` folder ব্যবহার করে, তাই cache নষ্ট হয়ে যায় এবং
> "Jest worker … exceeding retry limit" নামে একটা বিভ্রান্তিকর error আসে।
> হয়ে গেলে সমাধান: dev বন্ধ করুন → `frontend/.next` মুছুন → আবার dev চালু করুন।

---

## Environment variables

দুটো ফাইল, কোনোটাই git-এ commit করা হয় না। `.env.example` আর
`backend/.env.example`-এ প্রতিটা variable বিস্তারিত লেখা আছে — নিচের table শুধু
সারসংক্ষেপ।

### `.env` (repo-র root — Docker Compose এটা পড়ে)

| Variable | লাগবে? | নোট |
| --- | --- | --- |
| `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT` | হ্যাঁ | PostgreSQL container-এর credentials। Password-এ `@ : / # ?` **রাখবেন না** — Compose এটাকে সরাসরি connection URL-এ বসায়, encode করে না। |
| `BACKEND_PORT` | না | API-র host port। Default `4000`। |
| `NEXT_PUBLIC_API_URL` | শুধু server-এ | Browser থেকে API-র যে ঠিকানায় call যাবে। এটা **build-এর সময়** frontend-এর ভেতরে বসে যায়, তাই বদলালে rebuild লাগবে। |

### `backend/.env` (backend এটা পড়ে)

| Variable | লাগবে? | নোট |
| --- | --- | --- |
| `DATABASE_URL` | হ্যাঁ | Postgres connection string। Docker-এ এটা override হয়ে `db` service-এর নাম দিয়ে যায়। |
| `AWS_REGION` | হ্যাঁ | **`us-east-1`।** SES-এর domain verification, DKIM আর production access — সব **region অনুযায়ী আলাদা**। |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | হ্যাঁ | SES-এর credentials। |
| `SES_FROM` | হ্যাঁ | Verified sender address। এটা না থাকলে প্রথম send-এই error দেবে। |
| `SES_CONFIGURATION_SET` | শুধু server-এ | Bounce/complaint event SNS-এ পাঠানোর জন্য। **Local-এ কখনো সেট করবেন না** — AWS-এ যে নাম নেই সেটা দিলে SES প্রতিটা ইমেইল বাতিল করে দেয়। |
| `PUBLIC_URL` | শুধু server-এ | বাইরে থেকে backend-এর যে ঠিকানা। প্রতিটা unsubscribe, open আর click link এখানে পয়েন্ট করে, আর সেগুলো কয়েক দিন পর অন্য কারো inbox থেকে খোলা হয় — তাই server-এ এটা **অবশ্যই আসল public URL** হতে হবে। Local-এ না দিলে localhost ধরে নেয়। |
| `AUTOPAUSE_*` | না | Auto-pause-এর সীমা বদলানোর জন্য। Default গুলো `src/email/auto-pause.ts`-এ আছে। |
| `SNS_SKIP_VERIFY` | না | শুধু development-এ। SNS signature যাচাই বন্ধ করে দেয়। **Server-এ কখনো সেট করবেন না** — এই webhook address suppress করে, তাই URL জেনে ফেললে যে কেউ পুরো list unsubscribe করে দিতে পারবে। |

---

## Folder structure

```
.
├── backend/                    Express API + email worker
│   ├── prisma/
│   │   ├── schema.prisma       Database-এর model
│   │   └── migrations/         চালানো হয়ে যাওয়া SQL migration
│   └── src/
│       ├── routes/             HTTP endpoint (campaigns, contacts, webhooks, …)
│       ├── email/              Send loop, SES client, auto-pause, audience rules
│       ├── auth/               Session middleware
│       ├── scripts/            এককালীন কাজ (যেমন seed-admin)
│       ├── queue.ts            Scheduled send-এর জন্য pg-boss setup
│       └── index.ts            App-এর শুরুর ফাইল
├── frontend/                   Next.js dashboard
│   └── src/
│       ├── app/                Route আর page
│       ├── components/         শেয়ার করা UI
│       └── lib/                API client, audience rules, helper
├── design/                     UI concept-এর static mockup
├── docker-compose.yml          PostgreSQL (dev) বা db + backend + frontend (deploy)
└── sample-contacts.csv         CSV import-এর উদাহরণ ফাইল
```

### যে নিয়মগুলো দুই জায়গায় লেখা আছে

কিছু logic ইচ্ছাকৃতভাবে backend আর frontend — দুই জায়গাতেই আছে, যাতে screen যা
প্রতিশ্রুতি দেয় server ঠিক তাদেরই ইমেইল পাঠায়। **একটা বদলালে অন্যটাও বদলাতে হবে:**

| Backend | Frontend | কী ঠিক করে |
| --- | --- | --- |
| `matchesText` + `selectAudience` (`src/email/audience.ts`) | `matches` + `audienceOf` (`src/lib/audience.ts`) | কে campaign পাবে |
| `defaultTypesForCategory` (`src/email/send-campaign.ts`) | `defaultTypes` (`campaigns/[id]/page.tsx`) | কোন category-তে কোন contact type আগে থেকে টিক থাকবে |

---

## Deployment

Docker Compose তিনটা service চালায় — `db`, `backend`, `frontend` — প্রতিটা শুধু
`127.0.0.1`-এ bound (বাইরে থেকে সরাসরি ধরা যায় না)। nginx SSL সামলায় আর
request গুলো এভাবে পাঠায়:

| Path | কোথায় যায় |
| --- | --- |
| `/api/…` | Backend (`/api` অংশটা বাদ দিয়ে) |
| `/track/…`, `/unsubscribe`, `/webhooks/…` | Backend-এ, root path-এ — কারণ পাঠানো ইমেইলের ভেতরে এই URL গুলোই থাকে |
| বাকি সব | Frontend |

### নতুন পরিবর্তন server-এ পাঠানো

```bash
# server-এ, repo-র folder থেকে
git pull
docker compose up -d --build
```

Backend container চালু হওয়ার সময় database migration নিজে থেকেই চলে।
Secrets git-এ নেই: `.env` আর `backend/.env` শুধু server-এ আছে, তাই নতুন করে
clone করলে ওগুলো হাতে copy করতে হবে।

> ⚠️ **এখনকার infrastructure ইচ্ছাকৃতভাবে সাময়িক।** App চলছে একটা personal AWS
> EC2 instance-এ, personal subdomain দিয়ে — কোম্পানির যে server-গুলোতে অন্য live
> client project আছে সেগুলো থেকে আলাদা রাখা হয়েছে (ভুল হলে ঝুঁকি যাতে ওখানে না
> যায়)। পরে স্থায়ী company infrastructure-এ সরানো হবে, এটা জানা কাজ।
> **সরানোর সময় একসাথে যা যা বদলাতে হবে:** DNS, SSH config, nginx, SSL
> certificate, `PUBLIC_URL`, `NEXT_PUBLIC_API_URL` (এটার জন্য rebuild লাগবে) আর
> SNS webhook-এর subscription। বিস্তারিত [PROGRESS.md](PROGRESS.md)-এ।

---

## যে নিয়মগুলো ভাঙা যাবে না

এই নিয়মগুলো আছে কারণ ভাঙলে আসল ক্ষতি হয়। পূর্ণ ব্যাখ্যা [CLAUDE.md](CLAUDE.md)-এ।

- **SES একটা shared, live production account-এ চলে**, যেটা অন্য travel brand-রাও
  ব্যবহার করে। ভুল হলে পিছিয়ে যাওয়ার কোনো sandbox নেই। আমাদের bounce আর
  complaint rate তাদের reputation-ও নষ্ট করে।
- **Test শুধু SES simulator-এ করুন:** `success@simulator.amazonses.com`,
  `bounce@simulator.amazonses.com`, `complaint@simulator.amazonses.com`। কখনো
  `someone@example.com` জাতীয় বানানো ঠিকানা ব্যবহার করবেন না — production
  account-এ ওটা একটা **আসল hard bounce**।
- **`AWS_REGION` কখনো `ap-southeast-1` করবেন না।** AWS এই account-টা ওই region-এ
  বন্ধ করে রেখেছে।
- **Bounce ৫%-এর নিচে, complaint ০.১%-এর নিচে রাখুন।** Auto-pause হলো emergency
  brake — সেটা ইচ্ছাকৃতভাবে এই target-এর চেয়ে একটু ঢিলে, আর সেটা নিজে থেকে কখনো
  আবার চালু হয় না।
- **Contact-এর `status` বদলানো যায় না**, আর suppressed contact-এর email address
  বদলানো যায় না — suppression address ধরে কাজ করে, তাই নাম বদলে দিলে ওই ব্যক্তি
  একটা নতুন unblocked পরিচয় পেয়ে যেত।
- **Contact মুছলেও তার suppression record মুছে যায় না।** ওই record-টাই পরে CSV
  import করলে unsubscribe করা মানুষকে আবার ইমেইল পাঠানো আটকায়।
- **Client যা দেখে, তাতে কোনো emoji থাকবে না** — subject, body, unsubscribe page,
  এমনকি input box-এর placeholder-এও না (placeholder থেকেই অভ্যাসটা তৈরি হয়)।
- Merge, branch switch বা restart-এর পর **দুটো dev server-ই আবার চালু করুন**।
  পুরনো Next.js process পুরনো CSS/JS দেখাতে থাকে, যেটা দেখতে ঠিক bug-এর মতো লাগে।

---

## Documentation

| ফাইল | কী আছে |
| --- | --- |
| [PROGRESS.md](PROGRESS.md) | **প্রথমে এটা পড়ুন।** কী তৈরি হয়েছে, কী যাচাই করা হয়েছে, আর পরের কাজ কী। প্রতি session-এ আপডেট হয়। |
| [FINAL-PLAN.md](FINAL-PLAN.md) | পুরো roadmap — সব phase-এ কী কী হবে আর কেন। খুব কম বদলায়। |
| [CLAUDE.md](CLAUDE.md) | কাজের নিয়ম, architecture rules আর deliverability rules। |
| [GLOSSARY.md](GLOSSARY.md) | নতুনদের জন্য technical শব্দের ব্যাখ্যা (বাংলায়)। |

SES আর deliverability-র প্রশ্নের উত্তর আছে PROGRESS.md-এর § "Office AWS SES
account"-এ — এই account-এর আসল configuration-এর জন্য ওটাই source of truth।

---

## Roadmap

| Phase | কী | অবস্থা |
| --- | --- | --- |
| **১ — MVP** | Sender identity, contacts + CSV import, filter দিয়ে broadcast, unsubscribe + suppression, bounce/complaint webhook, exactly-once sending, open/click tracking, auto-pause | ✅ সম্পূর্ণ |
| **২** | Analytics dashboard ✅ · scheduling + timezone ✅ · login ✅ · multi-team + RBAC · approval workflow · আরও ভালো template editor · saved segments | আংশিক |
| **৩** | Multi-brand, preference center, automation ও drip campaign, A/B testing | পরিকল্পনায় |
| **৪** | API auto-sync, list cleaning, monitoring, advanced deliverability | পরিকল্পনায় |

এখনকার volume: প্রতি send-এ প্রায় ৭০০–৮০০ recipient, মাসে ৮,০০০–১০,০০০ ইমেইল।
এই পরিমাণে shared IP-ই যথেষ্ট, dedicated IP দরকার নেই।

---

## License

Proprietary — © Innovate Solution। বাইরের ব্যবহারের জন্য নয়।
