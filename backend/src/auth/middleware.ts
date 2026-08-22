// Gate for every route except the public ones an outsider's browser/AWS
// hits directly (health check, tracking pixel/link, unsubscribe, SNS
// webhook) — those can never require a login.
import type { NextFunction, Request, Response } from "express";
import { prisma } from "../prisma.js";

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; email: string; role: string };
      sessionId?: string;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({ error: "Not logged in." });

  const session = await prisma.session.findUnique({ where: { id: token }, include: { user: true } });
  if (!session || session.expiresAt < new Date()) {
    // Self-cleaning: an expired row found on read is never needed again.
    if (session) await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return res.status(401).json({ error: "Session expired, please log in again." });
  }

  req.user = { id: session.user.id, email: session.user.email, role: session.user.role };
  req.sessionId = session.id;
  next();
}

// Paths a browser or AWS reaches WITHOUT a logged-in session — an
// unsubscribe link days-old in someone's inbox, a tracking pixel, the
// SES→SNS webhook. Everything else needs a session.
const PUBLIC_PATHS = [/^\/health$/, /^\/track\//, /^\/unsubscribe$/, /^\/webhooks\//, /^\/auth\/login$/];

export function isPublicPath(path: string): boolean {
  return PUBLIC_PATHS.some((p) => p.test(path));
}
