// Small typed client for the MailHub backend.
import { getToken, clearToken } from "./auth";

export const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export type Brand = { id: string; name: string; domain: string; createdAt: string };
export type ContactType = "client" | "prospect" | "internal";
export type Contact = {
  id: string;
  email: string;
  name?: string | null;
  country?: string | null;
  plan?: string | null;
  type: ContactType;
  company?: string | null;
  status: string;
  createdAt: string;
};
export type SendFilter = {
  plan?: string;
  country?: string;
  company?: string;
  includeTypes?: ContactType[];
};
export type Campaign = {
  id: string;
  name: string;
  category: string;
  subject: string;
  html: string;
  /** draft | scheduled | sending | sent */
  status: string;
  createdAt: string;
  /** Absolute UTC instant the scheduled send fires. */
  scheduledAt?: string | null;
  /** IANA zone the user picked, e.g. "Asia/Dhaka" — for display only. */
  timezone?: string | null;
  /** Audience + filters frozen at schedule time. */
  sendOptions?: SendFilter | null;
  /** Why the last attempt did not finish (auto-pause, or retries exhausted). */
  lastError?: string | null;
};

// Auto-pause (circuit breaker) — whether this brand may send, and the rolling
// bounce/complaint numbers behind that answer.
export type SendingStatus = {
  paused: boolean;
  pausedAt: string | null;
  pauseReason: string | null;
  /** "auto" (thresholds) | "manual" (a person) */
  pausedBy: string | null;
  /** Rolling window the rates are measured over. */
  windowDays: number;
  sent: number;
  bounces: number;
  complaints: number;
  /** null when nothing was sent in the window — show "—", never a fake 0%. */
  bounceRate: number | null;
  complaintRate: number | null;
  /** False while too few emails were sent for the rates to mean anything. */
  enoughData: boolean;
  /** Set when a threshold is crossed right now (whether or not it is paused yet). */
  breach: string | null;
  thresholds: {
    windowDays: number;
    minSent: number;
    /** Never pause on fewer than this many bounce/complaint events. */
    minEvents: number;
    bounceRate: number;
    complaintRate: number;
  };
};
export type Recipient = {
  id: string;
  email: string;
  status: string;
  messageId?: string | null;
  openedAt?: string | null;
  clickedAt?: string | null;
  sentAt: string;
};
export type Template = {
  id: string;
  brandId: string;
  name: string;
  subject: string;
  category: string;
  html: string;
  isStarter: boolean;
  createdAt: string;
  updatedAt: string;
};
export type TemplateInput = {
  name: string;
  subject?: string;
  category?: string;
  html: string;
};
export type StarterTemplate = { key: string; label: string; subject: string; category: string; html: string };

// Analytics — every number is computed from real send/open/click rows.
// A rate is `null` (never 0) when there is nothing to divide by; the UI shows "—".
export type Analytics = {
  days: number;
  /** First day of the window (UTC midnight). */
  windowStart: string;
  totals: {
    contacts: number;
    subscribed: number;
    campaigns: number;
    campaignsSent: number;
    sent: number;
    failed: number;
    /** Rows stuck mid-send (a crashed send) — neither sent nor failed. */
    pending: number;
    opened: number;
    clicked: number;
  };
  /** Engagement, scoped to the window. */
  rates: { open: number | null; click: number | null };
  /**
   * Deliverability is ALL TIME on both sides of the division — Suppression is a
   * state table, not an event log, so it cannot be sliced by date.
   */
  deliverability: {
    sent: number;
    bounce: number;
    complaint: number;
    unsubscribe: number;
    rates: { bounce: number | null; complaint: number | null; unsubscribe: number | null };
  };
  series: { date: string; sent: number; opened: number; clicked: number }[];
  campaigns: {
    id: string;
    name: string;
    category: string;
    status: string;
    createdAt: string;
    sentAt: string | null;
    sent: number;
    opened: number;
    clicked: number;
    openRate: number | null;
    clickRate: number | null;
  }[];
};

/**
 * A failed API call. Carries the HTTP status and the parsed body, because some
 * callers need more than a message — e.g. a refused "Resume sending" answers 409
 * with `canForce`, which decides whether the UI may offer "Resume anyway".
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: Record<string, unknown> | null,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// Shared by every authenticated call, including the CSV upload below (which
// can't go through req() since it sends FormData, not JSON).
function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// The ONE place that reacts to "the session is gone" (logged out elsewhere,
// or it expired) — a hard redirect, because every other page's queries would
// otherwise fail one by one with no clear reason. Nothing else in the app
// (AuthGate included) should duplicate this; it would just double-navigate.
function handleUnauthorized(path: string) {
  if (typeof window !== "undefined" && path !== "/auth/login") {
    clearToken();
    if (!window.location.pathname.startsWith("/login")) window.location.href = "/login";
  }
}

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(API + path, {
    headers: { "Content-Type": "application/json", ...authHeaders() },
    ...opts,
  });
  if (!r.ok) {
    let msg = r.statusText;
    let body: Record<string, unknown> | null = null;
    try {
      body = await r.json();
      // A string error is already the sentence we want to show. Only Zod's issue
      // arrays need stringifying — JSON.stringify on a string just adds quotes,
      // which used to show up inside the toast.
      const e = body?.error;
      if (typeof e === "string") msg = e;
      else if (e) msg = JSON.stringify(e);
    } catch {}
    if (r.status === 401) handleUnauthorized(path);
    throw new ApiError(msg, r.status, body);
  }
  return r.json();
}

export type AuthUser = { email: string; role: string };

export const api = {
  login: (email: string, password: string) =>
    req<{ token: string; user: AuthUser }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    }),
  logout: () => req<void>("/auth/logout", { method: "POST" }),
  me: () => req<{ user: AuthUser }>("/auth/me"),

  brands: () => req<Brand[]>("/brands"),
  createBrand: (b: { name: string; domain: string }) =>
    req<Brand>("/brands", { method: "POST", body: JSON.stringify(b) }),

  contacts: (brandId: string) => req<Contact[]>(`/brands/${brandId}/contacts`),
  suppressions: (brandId: string) =>
    req<{ email: string; reason: string }[]>(`/brands/${brandId}/suppressions`),
  addContact: (brandId: string, c: Partial<Contact>) =>
    req<Contact>(`/brands/${brandId}/contacts`, { method: "POST", body: JSON.stringify(c) }),
  // `status` is not editable on purpose — it records what the PERSON did
  // (unsubscribed / bounced / complained) and must not be typed over.
  updateContact: (id: string, c: Partial<Omit<Contact, "id" | "status" | "createdAt">>) =>
    req<Contact>(`/contacts/${id}`, { method: "PUT", body: JSON.stringify(c) }),
  deleteContact: (id: string) =>
    req<{ ok: boolean; historyDeleted: number; stillSuppressed: boolean }>(`/contacts/${id}`, {
      method: "DELETE",
    }),
  importCsv: async (brandId: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const path = `/brands/${brandId}/contacts/import`;
    const r = await fetch(`${API}${path}`, { method: "POST", headers: authHeaders(), body: fd });
    if (!r.ok) {
      if (r.status === 401) handleUnauthorized(path);
      throw new Error("import failed");
    }
    return r.json() as Promise<{
      received: number;
      added: number;
      skipped: number;
      /** Values found in the CSV's type column that we don't recognise. */
      unknownTypes: string[];
    }>;
  },

  campaigns: (brandId: string) => req<Campaign[]>(`/brands/${brandId}/campaigns`),
  createCampaign: (brandId: string, c: Omit<Campaign, "id" | "status" | "createdAt">) =>
    req<Campaign>(`/brands/${brandId}/campaigns`, { method: "POST", body: JSON.stringify(c) }),
  // Subject/content/category can only change while the email has reached nobody —
  // the backend decides, and answers 409 with the delivered count if it has.
  // The name is always editable (it is our internal label, never sent).
  updateCampaign: (id: string, c: Partial<Pick<Campaign, "name" | "category" | "subject" | "html">>) =>
    req<Campaign>(`/campaigns/${id}`, { method: "PUT", body: JSON.stringify(c) }),
  deleteCampaign: (id: string) =>
    req<{ ok: boolean; recipientsDeleted: number }>(`/campaigns/${id}`, { method: "DELETE" }),
  sendCampaign: (id: string, filter: SendFilter) =>
    req<{
      matched: number;
      sent: number;
      skippedSuppressed: number;
      skippedAlready: number;
      failed: number;
      includeTypes: ContactType[];
      /** Present when auto-pause stopped the send before it reached everyone. */
      stoppedReason?: string;
    }>(`/campaigns/${id}/send`, { method: "POST", body: JSON.stringify(filter) }),
  recipients: (id: string) => req<Recipient[]>(`/campaigns/${id}/recipients`),

  // Scheduling. `localDateTime` is wall-clock time ("2026-07-28T14:30") and
  // `timezone` is the IANA zone it belongs to; the backend turns the pair into a
  // real instant, so the send fires at that clock time in that place.
  scheduleCampaign: (
    id: string,
    body: SendFilter & { localDateTime: string; timezone: string }
  ) => req<Campaign>(`/campaigns/${id}/schedule`, { method: "POST", body: JSON.stringify(body) }),
  unscheduleCampaign: (id: string) =>
    req<Campaign>(`/campaigns/${id}/unschedule`, { method: "POST" }),

  // Templates (saved email designs) — stored in the backend.
  templates: (brandId: string) => req<Template[]>(`/brands/${brandId}/templates`),
  createTemplate: (brandId: string, t: TemplateInput) =>
    req<Template>(`/brands/${brandId}/templates`, { method: "POST", body: JSON.stringify(t) }),
  updateTemplate: (id: string, t: Partial<TemplateInput>) =>
    req<Template>(`/templates/${id}`, { method: "PUT", body: JSON.stringify(t) }),
  deleteTemplate: (id: string) =>
    req<{ ok: boolean }>(`/templates/${id}`, { method: "DELETE" }),
  starterTemplates: () => req<StarterTemplate[]>("/starter-templates"),

  analytics: (brandId: string, days = 30) =>
    req<Analytics>(`/brands/${brandId}/analytics?days=${days}`),

  // Auto-pause. `force` on resume overrides a still-breached threshold — the
  // "I have already cleaned the list" case, since the rolling window keeps the
  // old events for days after the bad contacts are gone.
  sendingStatus: (brandId: string) => req<SendingStatus>(`/brands/${brandId}/sending-status`),
  resumeSending: (brandId: string, force = false) =>
    req<SendingStatus>(`/brands/${brandId}/resume-sending`, {
      method: "POST",
      body: JSON.stringify({ force }),
    }),
  pauseSending: (brandId: string, reason?: string) =>
    req<SendingStatus>(`/brands/${brandId}/pause-sending`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
};
