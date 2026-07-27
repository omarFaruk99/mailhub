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

const port = Number(process.env.BACKEND_PORT) || 4000;
const server = app.listen(port, () => {
  console.log(`Backend running on http://localhost:${port}`);
});

// Scheduled sends. Started after the server is listening so a queue problem can
// never stop the API from coming up (sending now keeps working either way).
startQueue();

// Let pg-boss finish/return the job it holds before the process dies, otherwise
// a dev restart leaves the job locked until its heartbeat expires.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    await stopQueue().catch(() => {});
    // A keep-alive connection (the frontend polls) can hold server.close() open
    // forever, which would hang every dev restart — so exit anyway after 5s.
    const force = setTimeout(() => process.exit(0), 5000);
    force.unref();
    server.close(() => process.exit(0));
  });
}
