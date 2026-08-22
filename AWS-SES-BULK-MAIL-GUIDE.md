# Bulk Mail সেটআপ — ধাপে ধাপে (AWS SES)

> এই গাইড কারো নিজের প্রজেক্টের জন্য না — যে কেউ নতুন bulk mail সিস্টেম
> বানাতে চান, তার জন্য সাধারণ গাইড। Developer না হলেও অনুসরণ করা যাবে।
> Navigation AWS-এর 2026 সালের console অনুযায়ী।

**যা লাগবে শুরুতে:** একটা ইমেইল, একটা কার্ড (AWS account খুলতে),
আর ডোমেইন কেনার টাকা (একটা ডোমেইন প্রতি বছর প্রায় $10-15)।

---

## ধাপ ১ — AWS Account খোলা

**Navigation:** aws.amazon.com → **Create an AWS Account** → ইমেইল,
পাসওয়ার্ড, কার্ড তথ্য দিয়ে সাইনআপ সম্পূর্ণ করুন।

---

## ধাপ ২ — Region বাছা

**Navigation:** AWS Console → উপরে ডানদিকে কোণায় region ড্রপডাউন
(যেমন লেখা থাকবে "N. Virginia" বা অন্য কিছু) → ক্লিক করে
**Asia Pacific (Singapore) ap-southeast-1** বাছুন।

⚠️ যা বাছবেন এই region-ই মনে রাখবেন — বাকি সব ধাপ এই একই region-এ করতে হবে।
Domain verify, DKIM, production access — সব **region আলাদা আলাদা**। এক region-এ
verify করলে অন্য region-এ কাজ করবে না।

⚠️ **নতুন account-এর জন্য Singapore ঠিক আছে (বাংলাদেশের সবচেয়ে কাছে)। কিন্তু
পুরনো account হলে আগে অবস্থা দেখে নিন** — AWS খারাপ bounce/complaint-এর কারণে
কোনো একটা region-এ পাঠানো বন্ধ (`SHUTDOWN`) করে রাখতে পারে, আর তখন ওই region-এ
কিছুই যাবে না। SES Console → **Account dashboard**-এ অবস্থা দেখা যায়।

> 📌 **এই প্রজেক্টের (MailHub) জন্য region = `us-east-1`**, Singapore নয়। অফিসের
> AWS account-এ `ap-southeast-1` বন্ধ করা আছে, আর তিনটে brand domain আগেই
> `us-east-1`-এ verify করা। বিস্তারিত: PROGRESS.md।

---

## ধাপ ৩ — SES কনসোলে যাওয়া

**Navigation:** উপরে সার্চ বক্সে লিখুন `SES` → **Amazon Simple Email
Service** ক্লিক করুন।

---

## ধাপ ৪ — Test Email ভেরিফাই করা (sender + receiver)

**Navigation:** SES কনসোল → **Configuration → Identities** →
**Create identity** বাটন → Identity type = **Email address** → ইমেইল
লিখুন → **Create identity**।

- ওই ইমেইলে AWS-এর confirm লিংক আসবে → ক্লিক করুন।
- এই কাজ **দুইবার** করুন — একবার sender ইমেইল দিয়ে, একবার receiver
  ইমেইল দিয়ে (দুইটা আলাদা ইমেইল এড্রেস)।

---

## ধাপ ৫ — Console থেকে Test Mail পাঠানো

**Navigation:** Identities লিস্ট → sender ইমেইলে ক্লিক করুন →
উপরে ডানে **Send test email** বাটন → To বক্সে receiver ইমেইল দিন →
**Send test email**।

📩 মেইল পেলেও এই ধাপে **Spam folder-এ যাওয়া স্বাভাবিক** — কারণ এখনো
domain ভেরিফাই করা হয়নি (SPF/DKIM নেই)। নিচের ধাপগুলো শেষ হলে এটা ঠিক
হয়ে যাবে।

---

## ধাপ ৬ — Domain কেনা (Namecheap)

ইতিমধ্যে ডোমেইন থাকলে এই ধাপ বাদ দিয়ে ধাপ ৭-এ যান।

**Navigation:** namecheap.com → সার্চে চাওয়া domain লিখুন → কার্টে
নিয়ে checkout করুন।

---

## ধাপ ৭ — Domain-এর DNS Cloudflare-এ আনা

**Navigation (Cloudflare):** dash.cloudflare.com → **Add a site** →
domain লিখুন → Free plan বাছুন → Cloudflare দুইটা nameserver দেখাবে।

**Navigation (Namecheap):** Namecheap → Domain List → domain-এর পাশে
**Manage** → **Nameservers** → **Custom DNS** বাছুন → Cloudflare-এর
দেওয়া দুইটা nameserver বসান → Save।

⏳ নতুন nameserver active হতে কয়েক ঘণ্টা লাগতে পারে।

---

## ধাপ ৮ — SES-এ Domain ভেরিফাই করা

**কেন এই ধাপ?**
কারণ Gmail/Yahoo জানতে চায় — এই ডোমেইনের মালিক কি সত্যিই আপনি?
এই ধাপ সেটার প্রমাণ দেয়।

মূল ডোমেইন সরাসরি না দিয়ে একটা **sub-domain** দেওয়া ভালো (যেমন
`mail.yourcompany.com`), যাতে bulk mail-এ সমস্যা হলে মূল ওয়েবসাইট/
ইমেইলের সুনাম (reputation) নষ্ট না হয়।

**Navigation:** SES → **Identities** → **Create identity** → Identity
type = **Domain** → domain/sub-domain লিখুন।

নিচে আরও কিছু অপশন দেখাবে:

| অপশন | কী করবেন |
|---|---|
| **DKIM signatures** | চালু/on রাখুন — মেইল প্রমাণ করার আসল জিনিস এটাই |
| **DKIM signing key length** | Default রাখুন (RSA 2048-bit) |
| **Publish DNS records to Route 53** | বন্ধ/off রাখুন — এটা শুধু DNS Route53-এ থাকলে লাগে, আপনার DNS Cloudflare-এ, তাই দরকার নেই |

আরও নিচে এই ৩টা checkbox দেখাবে — **তিনটাই খালি/unchecked রাখুন** (এখন দরকার নেই):

| Checkbox | কেন skip |
|---|---|
| **Assign a default configuration set** | event tracking (open/click/bounce)-এর advanced ফিচার, পরে আলাদাভাবে যোগ করা যায় |
| **Assign to a tenant** | multi-tenant/enterprise setup-এর জন্য, একজনের জন্য দরকার নেই |
| **Use a custom MAIL FROM domain** | DMARC আরও কড়া করে, কিন্তু DKIM already on থাকায় এটা ছাড়াই DMARC pass করবে |

শেষে **Create identity** ক্লিক করুন।

Identity তৈরি হওয়ার পর, ওই identity-এর পেজে **Authentication** ট্যাবে
দুইটা জায়গায় **"Publish DNS records"** দেখবেন — একটা **DKIM** সেকশনে,
একটা **DMARC** সেকশনে। **দুই জায়গাতেই ক্লিক করুন** (একটা বাছতে হবে না,
দুটোই লাগে)। ক্লিক করলে রেকর্ডের Type/Name/Value দেখাবে — Route53 use
না করায় এটা কোথাও নিজে থেকে বসবে না, শুধু কপি করার জন্য দেখাবে।

---

## ধাপ ৯ — DKIM/DMARC রেকর্ড Cloudflare-এ বসানো

**Navigation:** Cloudflare → আপনার domain → **DNS** সেকশন → **Records** →
**Add record** → নিচেরগুলো এক এক করে বসান।

**DKIM (৩টা CNAME)** — ধাপ ৮-এর DKIM সেকশনে যা Name ও Value দেখিয়েছে,
সেগুলো হুবহু কপি করে বসান।

**DMARC (১টা TXT)** — ধাপ ৮-এর DMARC সেকশনে যা দেখিয়েছে (সাধারণত
default `p=none` দিয়ে), সেটাও হুবহু কপি করে বসান।
- (`p=none` মানে শুরুতে শুধু রিপোর্ট পাঠাবে, মেইল ব্লক করবে না — কয়েক
  সপ্তাহ পর্যবেক্ষণ করে পরে `p=quarantine` বা `p=reject`-এ কড়া করা যায়)

**SPF (ঐচ্ছিক, SES নিজে থেকে দেখায় না):** যেহেতু "Use a custom MAIL FROM
domain" আমরা skip করেছি (ধাপ ৮), SES ডিফল্টভাবে নিজের `amazonses.com`
address দিয়ে পাঠায় — সেখানে SPF আগে থেকেই ঠিক করা আছে। তাই DKIM +
DMARC-ই যথেষ্ট, SPF আলাদা করে বসানো এখন **বাধ্যতামূলক না**।

⚠️ **কিন্তু পরে custom MAIL FROM চালু করলে SPF বাধ্যতামূলক হয়ে যায়।** তখন খামের
ঠিকানা হবে আপনার নিজের domain, আর সেই domain-এ SPF না থাকলে **SPF ফেল করবে** —
Gmail/Outlook-এ inbox-এ পৌঁছানো খারাপ হবে। তাই নিয়ম: custom MAIL FROM চালু করার
**আগেই** SPF রেকর্ড বসান, পরে নয়।

⚠️ প্রতিটা রেকর্ড বসানোর সময় proxy status **DNS only (grey cloud)**
রাখুন, orange cloud না — মেইল রেকর্ডে Cloudflare-এর প্রক্সি কাজ করে না।

---

## ধাপ ১০ — Domain Verified হওয়ার অপেক্ষা

**Navigation:** SES → Identities → domain নামের পাশে status চেক করুন।

- Status **Pending** থেকে **Verified** হতে সাধারণত ৫ মিনিট থেকে কয়েক
  ঘণ্টা লাগে, তবে AWS বলে **সর্বোচ্চ ৭২ ঘণ্টা** পর্যন্ত লাগতে পারে।
- DKIM status আলাদাভাবে **Successful** দেখাতে হবে — শুধু domain
  verified হলেই চলবে না, DKIM-ও verified হতে হবে।
- এই সময়টায় SES-এর **Get set up** পেজে "Request production access"
  বাটন **disabled (ধূসর)** থাকবে — এটা স্বাভাবিক, verify হলেই চালু হবে।

---

## ধাপ ১১ — Access Key বানানো (API দিয়ে পাঠাতে চাইলে)

⚠️ **ধাপ ১১ বা ধাপ ১২ — যেকোনো একটা করলেই চলে, দুটোই লাগে না।**
এই একটা করলে পরেরটা (SMTP) স্কিপ করে সরাসরি ধাপ ১৩-এ যান।

**Navigation:** সার্চ বক্সে লিখুন `IAM` → **IAM** কনসোল → বামের সাইডবারে
**Access Management → IAM users** ক্লিক → **Create user** → নাম দিন
(যেমন `ses-sender`) → Next → **Attach policies directly** → সার্চে
`AmazonSESFullAccess` লিখে টিক দিন → Create user।

তারপর: IAM users লিস্ট → `ses-sender` ক্লিক → **Security credentials** ট্যাব →
**Create access key** → Use case = **Application running outside AWS**
→ Create access key।

- `Access Key ID` ও `Secret Access Key` দেখাবে — **একবারই দেখাবে**,
  সাথে সাথে ডাউনলোড/সেভ করুন।

---

## ধাপ ১২ — SMTP Credential বানানো (SMTP দিয়ে পাঠাতে চাইলে, ঐচ্ছিক)

⚠️ **ধাপ ১১ ইতিমধ্যে করে থাকলে এই ধাপ স্কিপ করুন**, সরাসরি ধাপ ১৩-এ যান।
API আর SMTP — যেকোনো একটা হলেই চলে, দুটোই লাগে না। SMTP পুরনো
mail library-এর সাথে সহজে কাজ করে।

**Navigation:** SES কনসোল → বামের সাইডবারে **SMTP settings** → এখানে
দুইটা অপশন দেখাবে:

| অপশন | কী করবেন |
|---|---|
| **Mail Manager SMTP** (default/Recommended) | **বাছবেন না** — এটায় extra "Mail Manager processing charges" আছে |
| **IAM SMTP credentials** | **এটা বাছুন** — ফ্রি, সাধারণ ব্যবহারের জন্য যথেষ্ট |

**IAM SMTP credentials** বেছে → **Create SMTP credentials** → একটা
**"Create user for SMTP"** পেজ খুলবে:

- **User name** — default রাখা যায় (যেমন `ses-smtp-user.20260820-200820`)
- **Permissions** — AWS নিজে থেকে একটা group বানাবে
  (`AWSSESSendingGroupDoNotRename`), যাতে শুধু `ses:SendRawEmail`
  permission থাকে — এটা Access Key-এর `AmazonSESFullAccess`-এর চেয়েও
  নিরাপদ (শুধু মেইল পাঠানোর অনুমতি, আর কিছু না)
- **Tags** — খালি রাখুন (ঐচ্ছিক)

শেষে **Create user** ক্লিক করুন। এরপর **"Retrieve SMTP credentials"**
পেজে দেখাবে:

- **IAM user name** — যা উপরে দিয়েছিলেন
- **SMTP user name** — এটা IAM user name থেকে আলাদা, Access Key-এর মতো
  দেখতে একটা কোড (যেমন `AKIAEXAMPLE1234567890`)
- **SMTP password** — লুকানো থাকে, **Show** ক্লিক করলে দেখা যায়

⚠️ এই পেজেই একবারই SMTP password দেখাবে — পরে আর ফিরে দেখা যাবে না।
**Download .csv file** বাটনে ক্লিক করে সেভ করে রাখুন।

নতুন console-এ SMTP endpoint/port আলাদাভাবে আর দেখায় না — এটা region
অনুযায়ী ফিক্সড:
- **Endpoint:** `email-smtp.<region>.amazonaws.com` (যেমন আপনার region
  `ap-southeast-1` হলে `email-smtp.ap-southeast-1.amazonaws.com`)
- **Port:** `587` (recommended, STARTTLS দিয়ে) — বিকল্প হিসেবে `465`
  (TLS wrapper) ব্যবহার করা যায়, `25` এড়িয়ে চলুন

---

## ধাপ ১৩ — Production Access রিকোয়েস্ট করা

এতক্ষণ যা করলেন সব **Sandbox mode**-এ — শুধু ভেরিফাই করা এড্রেসে মেইল
যায়। আসল ক্লায়েন্টদের পাঠাতে এই ধাপ লাগবেই।

**Navigation:** SES → বামের সাইডবারে **Get set up** → "Request production
access" কার্ডে **Request production access** বাটন ক্লিক করুন (ধাপ ১০
শেষ না হলে এই বাটন disabled থাকবে) → ফর্মে জানতে চাইবে:
- মেইল কী ধরনের (Marketing/Transactional)
- লিস্ট কীভাবে বানানো (মানুষ কীভাবে subscribe করেছে)
- Unsubscribe আছে কিনা
- Bounce/complaint কীভাবে সামলাবেন

ফর্ম পূরণ করে **Submit for review**।

⏳ সাধারণত ২৪–৪৮ ঘণ্টায় সিদ্ধান্ত আসে (ইমেইলে)।

---

## ধাপ ১৪ — Production Approve হওয়া চেক করা

**Navigation:** SES → Account dashboard → **Sending limits** সেকশনে
"Sandbox" এর বদলে দেখাবে **Production access granted**, সাথে দৈনিক
sending quota।

---

## ধাপ ১৫ — Developer-কে হ্যান্ডওভার

নিচেরগুলো নিরাপদে (পাসওয়ার্ড ম্যানেজার/এনক্রিপ্টেড শেয়ার — চ্যাটে না) দিন:

- AWS Region (যেমন `ap-southeast-1`)
- Access Key ID + Secret Access Key (API ব্যবহার করলে)
- SMTP endpoint + username + password (SMTP ব্যবহার করলে)
- ভেরিফাই করা sender domain/email (যেমন `no-reply@mail.yourcompany.com`)
- Production access পাওয়া গেছে কনফার্ম
- Cloudflare DNS এডিট এক্সেস (পরে নতুন রেকর্ড লাগতে পারে)

---

## মনে রাখার জিনিস

- **Bounce** (মেইল না পৌঁছানো) আর **Complaint** (স্প্যাম রিপোর্ট) বেশি হলে
  AWS একাউন্ট ব্লক করে দিতে পারে। লিস্ট পরিষ্কার রাখুন।
- প্রতিটা মেইলে **Unsubscribe লিংক** থাকতে হবে।
- খরচ: প্রতি ১,০০০ মেইলে প্রায় $0.10 (আনুমানিক) — খুবই সস্তা।
- নতুন domain দিয়ে হুট করে হাজার হাজার মেইল পাঠাবেন না — ধীরে ধীরে
  বাড়ান ("warm up"), নাহলে স্প্যাম ফোল্ডারে যাওয়ার সম্ভাবনা বাড়ে।

---

## Access Key আর Domain — গুরুত্বপূর্ণ পয়েন্ট

যে domain(s) আপনার AWS SES account-এ verify করা আছে, সেই account-এর
Access Key/credential যার কাছে যাবে, সে **সব verified domain থেকেই**
মেইল পাঠাতে পারবে। Access Key কোনো নির্দিষ্ট person বা domain-এর সাথে
বাঁধা না — চাবি যার হাতে, সে account-এর সব ক্ষমতা পায়। তাই:

- Access Key/SMTP credential শুধু বিশ্বস্ত Developer-কে, নিরাপদভাবে দিন।
- Leak হলে বা ভুল মানুষের হাতে গেলে, সে আপনার নামে (verified domain
  থেকে) মেইল পাঠাতে পারবে — এমনকি spam/phishing-ও।
- একাধিক developer/team থাকলে প্রতিটার জন্য **আলাদা Access Key** বানানো
  ভালো (একই IAM approach, শুধু আলাদা user) — কারো access বাতিল করতে
  চাইলে শুধু ওই একটা key delete করলেই হয়, বাকিদের প্রভাবিত না করে।

---

### Sources (navigation যাচাই করা হয়েছে)
- [Creating and verifying identities in Amazon SES](https://docs.aws.amazon.com/ses/latest/dg/creating-identities.html)
- [Verified identities in Amazon SES](https://docs.aws.amazon.com/ses/latest/dg/verify-addresses-and-domains.html)
- [Obtaining Amazon SES SMTP credentials](https://docs.aws.amazon.com/ses/latest/dg/smtp-credentials.html)
