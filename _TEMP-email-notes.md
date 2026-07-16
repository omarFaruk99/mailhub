# 📝 অস্থায়ী নোট — Email / SMTP / SES (পরে মুছে ফেলব)

> উদ্দেশ্য: SMTP ও SES ধারণা recap। আমরা কী বানাচ্ছি, কী লাগবে, WordPress-এ আগে
> কী সেটআপ ছিল — সব এক জায়গায়। **এটা temporary; পরে delete করব।**

---

## ১. মূল ধারণা — SES-এ পাঠানোর ২টা "দরজা"

একই Amazon SES, কিন্তু ঢোকার দুই উপায়:

| দরজা | কী লাগে | কে ব্যবহার করে |
|------|---------|----------------|
| **SMTP** | host + port + SMTP username + SMTP password | পুরনো WordPress প্রজেক্ট |
| **API** (AWS SDK) | Access Key ID + **Secret Access Key** | **আমাদের MailHub** ✅ |

- দুটোই একই SES দিয়ে মেইল পাঠায়।
- `AKIA…` অংশ (Access Key ID) দুটোতেই থাকে, কিন্তু **SMTP password ≠ Secret Access Key**।

---

## ২. আগের WordPress প্রজেক্টে যা সেটআপ ছিল

(পাওয়া গেছে: `2. TeamUpdate/innovate-version-tracker` এর docs ও functions.php থেকে)

| বিষয় | তথ্য |
|------|------|
| Mailer | Amazon SES, **WP Mail SMTP** প্লাগিন দিয়ে |
| SMTP host | `email-smtp.us-east-1.amazonaws.com` |
| Port | 587 |
| Region | **us-east-1** |
| From | `no-reply@innovatesolution.com` |
| To (list) | `functions.php`-এ hardcoded, BCC দিয়ে ৪০ জন করে chunk |
| Domain | innovatesolution.com — **verified, production, DKIM signed** ✅ |
| পাঠানোর ধরন | `wp_mail()` কল, ১২০+ জনকে |

**পুরনো সিস্টেমের সমস্যা (যা MailHub সমাধান করবে):**
- ❌ Unsubscribe নেই
- ❌ SES **suppression list** সমস্যা (spam report / invalid email)
- ❌ Bounce/complaint auto-handle নেই
- ❌ Subscriber list কোডে hardcoded (database-এ নেই)
- ❌ Open/click tracking নেই

---

## ৩. আমাদের MailHub-এ যা লাগবে

আমাদের কোড **API দরজা** ব্যবহার করে। `backend/.env`-এ লাগবে:

```
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=AKIA........          ← Access Key ID
AWS_SECRET_ACCESS_KEY=..................  ← Secret Access Key (raw)
SES_FROM=verified-email-or-domain
```

- WordPress-এর SMTP password **কাজে লাগবে না** — আমাদের Secret Access Key লাগবে।
- Sandbox নিয়ম: নতুন SES sandbox-এ থাকে → শুধু **verified ইমেইলেই** পাঠানো যায়।

---

## ৪. এখন dev-এর পরিকল্পনা

| এখন (dev) | পরে (production) |
|-----------|------------------|
| **ব্যক্তিগত AWS free-tier SES** | অফিসের / brand-এর আসল SES |
| একটা ইমেইল verify করে টেস্ট | domain verify + production access |
| ঝুঁকিমুক্ত, আপনার নিয়ন্ত্রণে | আসল client-দের কাছে পাঠানো |

- আছে: ব্যক্তিগত AWS EC2 (free), domain **omarsec.com**, Cloudflare।
- ঐচ্ছিক: omarsec.com SES-এ verify করলে `no-reply@omarsec.com` থেকে পাঠানো যাবে।
- **কোড বদলাবে না** — শুধু `.env`-এর মান বদলাবে (dev → production)।

---

## ৫. নিরাপত্তা নিয়ম (গুরুত্বপূর্ণ)

- 🔒 গোপন key **কখনো** চ্যাটে/GitHub-এ দেবেন না — শুধু `.env`-এ।
- ⚠️ চ্যাটে যে office SMTP key দেখানো হয়েছিল, সেটা **ফাঁস** → AWS-এ delete করে নতুন বানাতে হবে।
- `.env` gitignored — কখনো commit হয় না।

---

## ৬. এক লাইনে সারাংশ

> পুরনো WordPress = SES-এর **SMTP দরজা** দিয়ে সাধারণ মেইল (unsubscribe/tracking ছাড়া)।
> MailHub = SES-এর **API দরজা** দিয়ে পেশাদার মেইল (unsubscribe + suppression + tracking সহ)।
> dev-এ personal AWS দিয়ে টেস্ট, পরে আসল brand SES বসাব — শুধু `.env` বদলে।

---

## ৭. এখন কী করছি vs DevOps ফিরলে কী করব

**কোড ও সিস্টেম একই থাকবে — শুধু `.env`-এর মান বদলাবে।**

| বিষয় | এখন (আমার ব্যক্তিগত — dev) | DevOps ফিরলে (office — production) |
|------|----------------------------|-------------------------------------|
| AWS account | আমার ব্যক্তিগত AWS (free tier) | office AWS |
| Domain (sender) | **omarsec.com** (SES-এ verify) | brand domain (innovatesolution.com, tripgic.com...) |
| From ঠিকানা | `no-reply@omarsec.com` | `no-reply@innovatesolution.com` ইত্যাদি |
| API key | আমার personal Access Key + Secret | office-এর নতুন (rotated) key |
| Recipient | sandbox → শুধু verified Gmail | production → যেকোনো client |
| কোড | একই | **একই (বদলাবে না)** |
| যা বদলাবে | — | শুধু **`backend/.env`**-এর মান |

**এখন যা করছি (ধাপ):**
1. Personal AWS SES-এ **omarsec.com** verify (Cloudflare-এ DKIM DNS বসিয়ে)।
2. আমার **Gmail** verify (sandbox recipient)।
3. IAM API key বানানো।
4. `backend/.env`-এ বসানো → টেস্ট মেইল পাঠানো।

**DevOps ফিরলে যা করব:**
1. office AWS-এ brand domain(গুলো) verify + DKIM/SPF/DMARC।
2. Production access চাওয়া (sandbox থেকে বের হতে)।
3. office-এর নতুন API key `.env`-এ বসানো।
4. `SES_FROM` = brand-এর আসল ঠিকানা।
5. ব্যস — কোড অপরিবর্তিত, আসল client-দের পাঠানো শুরু।

---

## ৮. DevOps গাইড — একটি brand domain SES-এ সেটআপ (reusable)

> এই ধাপগুলো **যেকোনো domain**-এর জন্য একই — এখন omarsec.com (dev), পরে
> innovatesolution.com / tripgic.com / tripmargin.com (production)। শুধু domain ও
> account বদলাবে।

**A. Region ঠিক করুন**
- একটাই region বেছে সব brand-এ ব্যবহার করুন (যেমন **us-east-1**)।
- Console-এ উপরে ডানে region সিলেক্ট করুন। `.env`-এর `AWS_REGION` একই রাখুন।

**B. Domain identity তৈরি**
- AWS → **SES** → **Identities** → **Create identity**।
- **Domain** সিলেক্ট → brand-এর domain লিখুন (যেমন omarsec.com)।
- **Easy DKIM** on (RSA 2048) → **Create identity**।

**C. DKIM DNS record বসান (Cloudflare)**
- SES যে **৩টি CNAME** দেবে → Cloudflare → ওই domain → **DNS** → ৩টি CNAME যোগ।
- Proxy = **DNS only** (ধূসর মেঘ), কমলা না।
- কয়েক মিনিট পর SES-এ domain **Verified** দেখাবে।

**D. (Production-এর জন্য) SPF + DMARC + custom MAIL FROM**
- **Custom MAIL FROM**: SES identity → MAIL FROM domain (যেমন `mail.branddomain.com`)
  → SES দেওয়া MX + TXT(SPF) record Cloudflare-এ বসান।
- **DMARC**: Cloudflare-এ TXT record — নাম `_dmarc.branddomain.com`,
  মান `v=DMARC1; p=quarantine; rua=mailto:dmarc@branddomain.com`।

**E. Production access চাওয়া (sandbox থেকে বের হতে)**
- SES → **Account dashboard** → **Request production access**।
- ফর্মে use-case লিখুন (transactional/marketing, unsubscribe আছে, list consented)।
- অনুমোদন পেলে **যেকোনো client**-কে পাঠানো যাবে।

**F. API key বানানো (অ্যাপের জন্য)**
- IAM → user → policy **AmazonSESFullAccess** (বা শুধু `ses:SendEmail` scoped)।
- **Create access key** → Key ID + Secret → অ্যাপের `.env`-এ বসান।

**G. অ্যাপের `.env`**
```
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
SES_FROM=no-reply@branddomain.com
```

**নিয়ম:** প্রতি brand = আলাদা domain identity + আলাদা reputation। এক brand-এর
সমস্যা অন্যটিকে ছোঁবে না। কোড এক — শুধু `.env` ও domain বদলায়।

---

## ৯. ✅ যা সফলভাবে সেটআপ হয়েছে (dev — সম্পন্ন)

> এটাই আসল রেকর্ড — DevOps একই ধাপে office/brand-এ করতে পারবে।
> তারিখ: 2026-07-16 · Status: **কাজ করছে** (sandbox)

**পরিবেশ:**
| বিষয় | মান |
|------|-----|
| AWS account | ব্যক্তিগত (practice) |
| Region | **ap-southeast-1** (Singapore) |
| Sender domain | **omarsec.com** (SES-এ Verified, DKIM ✅) |
| From | `no-reply@omarsec.com` (মেইলবক্স নেই — domain verify যথেষ্ট) |
| Recipient (sandbox, verified) | `omarfaruk19952035@gmail.com`, `shuvon19952035@gmail.com` |
| IAM user | `mailhub-dev` + policy `AmazonSESFullAccess` |

**যে ধাপে হয়েছে:**
1. SES → Create identity → **Domain** `omarsec.com` → Easy DKIM (RSA 2048),
   "Publish to Route53" **uncheck** (কারণ domain Cloudflare-এ)।
2. SES-এর দেওয়া **৩টি DKIM CNAME** → Cloudflare DNS-এ যোগ, Proxy **DNS only**।
   কয়েক মিনিটে domain **Verified**।
3. SES → Create identity → **Email** → Gmail verify (ইনবক্সের লিংকে ক্লিক)।
4. IAM → user `mailhub-dev` → `AmazonSESFullAccess` → **Create access key**
   (Application outside AWS) → Key ID + Secret।
5. `backend/.env`-এ বসানো:
   ```
   AWS_REGION=ap-southeast-1
   AWS_ACCESS_KEY_ID=...
   AWS_SECRET_ACCESS_KEY=...
   SES_FROM=no-reply@omarsec.com
   ```
6. Server চালিয়ে `POST /test-email {"to":"...gmail"}` → **messageId** পাওয়া গেল →
   Gmail-এ মেইল এল (mailed-by `ap-southeast-1.amazonses.com`, signed-by `omarsec.com`)।

**ফল:** ✅ মেইল inbox-এ, DKIM signed।

**এখনো বাকি (dev-এ দরকার নেই, production-এ লাগবে):**
- Production access (sandbox → যেকোনো recipient)।
- Custom MAIL FROM + SPF + DMARC (deliverability)।

**DevOps যা বদলাবে (office production):** region → us-east-1 (বা office-এর),
domain → brand domain, key → office-এর নতুন key, `SES_FROM` → brand ঠিকানা।
**কোড বদলাবে না।**

_(এই ফাইল temporary — বোঝা শেষ হলে delete করব।)_
