import "dotenv/config";
import express from "express";
import cors from "cors";
import brandsRouter from "./routes/brands.js";
import emailRouter from "./routes/email.js";
import campaignsRouter from "./routes/campaigns.js";
import templatesRouter from "./routes/templates.js";
import trackingRouter from "./routes/tracking.js";
import webhooksRouter from "./routes/webhooks.js";
import analyticsRouter from "./routes/analytics.js";
import segmentsRouter from "./routes/segments.js";
import { startQueue, stopQueue } from "./queue.js";

const app = express();
app.use(cors()); // allow the frontend (localhost:3000) to call this API
app.use(express.json());

// Health check — proves the server is alive.
app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "mailhub-backend" });
});

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
// Segments (saved, named audience rules).
app.use("/", segmentsRouter);

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
