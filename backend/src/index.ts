import "dotenv/config";
import express from "express";
import cors from "cors";
import authRouter from "./routes/auth.js";
import brandsRouter from "./routes/brands.js";
import emailRouter from "./routes/email.js";
import campaignsRouter from "./routes/campaigns.js";
import templatesRouter from "./routes/templates.js";
import trackingRouter from "./routes/tracking.js";
import webhooksRouter from "./routes/webhooks.js";
import analyticsRouter from "./routes/analytics.js";
import { startQueue, stopQueue } from "./queue.js";
import { requireAuth, isPublicPath } from "./auth/middleware.js";

const app = express();
app.use(cors()); // allow the frontend (localhost:3000) to call this API
app.use(express.json());

// Health check — proves the server is alive.
app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "mailhub-backend" });
});

// Everything below needs a logged-in session, except the handful of paths an
// outsider's browser or AWS reaches directly (tracking pixel/link,
// unsubscribe, /auth/login, the SES→SNS webhook — see isPublicPath). This
// gate runs BEFORE any router is mounted, authRouter included: a route
// added to auth.ts later is protected by default unless it's added to
// isPublicPath, rather than depending on every route remembering its own
// requireAuth.
app.use((req, res, next) => {
  if (isPublicPath(req.path)) return next();
  return requireAuth(req, res, next);
});

// Login/logout/me.
app.use("/", authRouter);

// Brand + contact routes.
app.use("/", brandsRouter);
// Test email route.
app.use("/", emailRouter);
// Campaign + unsubscribe routes.
app.use("/", campaignsRouter);
// Template (saved email designs) routes.
app.use("/", templatesRouter);
// Open/click tracking.
app.use("/", trackingRouter);
// SES → SNS webhook (bounce/complaint auto-suppression).
app.use("/", webhooksRouter);
// Analytics (real open/click/bounce numbers).
app.use("/", analyticsRouter);

const port = Number(process.env.BACKEND_PORT) || 4000;

// Scheduled sends, started BEFORE the first request is accepted. Its startup
// step resets campaigns left mid-send by a crash, which is only safe while
// nothing can be in flight — if the API were already serving, a "Send now" in
// that window would be reset out from under itself.
// A queue failure is caught inside startQueue() and only disables scheduling, so
// this can never stop the API from coming up.
await startQueue();

const server = app.listen(port, () => {
  console.log(`Backend running on http://localhost:${port}`);
});

// Let pg-boss finish/return the job it holds before the process dies, otherwise
// a dev restart leaves the job locked until its heartbeat expires.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    // Armed BEFORE the awaits: pg-boss's graceful stop can take ~30s and a
    // keep-alive connection (the frontend polls) can hold server.close() open
    // forever. Either would hang every dev restart, so exit regardless after 8s.
    const force = setTimeout(() => process.exit(0), 8000);
    force.unref();
    await stopQueue().catch(() => {});
    server.close(() => process.exit(0));
  });
}
