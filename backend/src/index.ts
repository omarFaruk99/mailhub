import "dotenv/config";
import express from "express";
import cors from "cors";
import brandsRouter from "./routes/brands.js";
import emailRouter from "./routes/email.js";
import campaignsRouter from "./routes/campaigns.js";
import templatesRouter from "./routes/templates.js";
import trackingRouter from "./routes/tracking.js";
import webhooksRouter from "./routes/webhooks.js";

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

const port = Number(process.env.BACKEND_PORT) || 4000;
app.listen(port, () => {
  console.log(`Backend running on http://localhost:${port}`);
});
