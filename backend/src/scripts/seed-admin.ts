// Create (or reset the password of) one login account.
// Reads credentials from env vars on purpose — never hardcode a real
// password in a file that gets committed.
//
// Usage (from backend/):
//   ADMIN_EMAIL=someone@innovatesolution.com ADMIN_PASSWORD='...' npx tsx src/scripts/seed-admin.ts
import "dotenv/config";
import bcrypt from "bcryptjs";
import { prisma } from "../prisma.js";

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;

if (!email || !password) {
  console.error("Set ADMIN_EMAIL and ADMIN_PASSWORD env vars before running this script.");
  process.exit(1);
}

const passwordHash = await bcrypt.hash(password, 10);
const user = await prisma.user.upsert({
  where: { email },
  update: { passwordHash },
  create: { email, passwordHash },
});

// A password reset must kill every session created under the OLD password —
// otherwise a stolen token from before the reset (the whole reason someone
// runs this) keeps working for up to 30 days regardless.
const { count } = await prisma.session.deleteMany({ where: { userId: user.id } });

console.log(`OK: login account ready for ${user.email} (role: ${user.role})`);
if (count > 0) console.log(`Signed out ${count} existing session(s) for this account.`);
await prisma.$disconnect();
