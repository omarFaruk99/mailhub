// Login / logout / "who am I". Simple email+password auth — one shared
// account type for now (role is always "admin"); RBAC comes later without
// touching this shape (see prisma schema comment on User).
import { Router } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { prisma } from "../prisma.js";

const router = Router();

// A session lives 30 days — this is an internal tool for a couple of staff,
// so we favour not re-logging-in over a short expiry.
const SESSION_DAYS = 30;

// Deploy (PROGRESS.md's very next step) puts this on a public URL, so login
// stops being reachable only by people who already know it's there. Without
// this, the one known admin email could be brute-forced with unlimited
// password guesses. Keyed by IP by default — once behind nginx, deploy must
// set `app.set("trust proxy", ...)` to the real hop count, or every request
// looks like it comes from the proxy and shares one bucket.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Wait a while and try again." },
});

// Computed once at startup and compared against on every login for an
// UNKNOWN email, so that branch costs the same ~bcrypt time as a KNOWN
// email's real check. Without this, an unknown email returns 401
// immediately while a known one waits for bcrypt.compare — a timing gap
// that lets someone learn which staff emails exist even though both cases
// show the same error message.
const DUMMY_HASH = await bcrypt.hash("not-a-real-password", 10);

const loginSchema = z.object({
  email: z.string().min(1),
  password: z.string().min(1),
});

router.post("/auth/login", loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Email and password are required." });

  const email = parsed.data.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });
  // Same message whether the email is unknown or the password is wrong —
  // telling them apart would let someone probe which staff emails exist.
  const invalid = () => res.status(401).json({ error: "Wrong email or password." });
  if (!user) {
    await bcrypt.compare(parsed.data.password, DUMMY_HASH); // burn the same time a real check would
    return invalid();
  }

  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!ok) return invalid();

  // Best-effort tidy-up so the table doesn't grow forever — cheap here since
  // logins are a handful a day, not a hot path.
  await prisma.session.deleteMany({ where: { userId: user.id, expiresAt: { lt: new Date() } } }).catch(() => {});

  const session = await prisma.session.create({
    data: {
      userId: user.id,
      expiresAt: new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000),
    },
  });

  res.json({ token: session.id, user: { email: user.email, role: user.role } });
});

// No requireAuth here: the global gate in index.ts already ran before this
// router was mounted, so req.user/req.sessionId are already set for any
// request that reaches these two handlers.
router.post("/auth/logout", async (req, res) => {
  await prisma.session.delete({ where: { id: req.sessionId! } }).catch(() => {});
  res.status(204).end();
});

router.get("/auth/me", async (req, res) => {
  res.json({ user: { email: req.user!.email, role: req.user!.role } });
});

export default router;
