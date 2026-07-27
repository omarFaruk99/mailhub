// Small typed client for the MailHub backend.
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
export type Campaign = {
  id: string;
  name: string;
  category: string;
  subject: string;
  html: string;
  status: string;
  createdAt: string;
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
  rates: {
    open: number | null;
    click: number | null;
    bounce: number | null;
    complaint: number | null;
    unsubscribe: number | null;
  };
  suppressions: { bounce: number; complaint: number; unsubscribe: number; total: number };
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

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(API + path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!r.ok) {
    let msg = r.statusText;
    try {
      const b = await r.json();
      msg = b.error ? JSON.stringify(b.error) : msg;
    } catch {}
    throw new Error(msg);
  }
  return r.json();
}

export const api = {
  brands: () => req<Brand[]>("/brands"),
  createBrand: (b: { name: string; domain: string }) =>
    req<Brand>("/brands", { method: "POST", body: JSON.stringify(b) }),

  contacts: (brandId: string) => req<Contact[]>(`/brands/${brandId}/contacts`),
  suppressions: (brandId: string) =>
    req<{ email: string; reason: string }[]>(`/brands/${brandId}/suppressions`),
  addContact: (brandId: string, c: Partial<Contact>) =>
    req<Contact>(`/brands/${brandId}/contacts`, { method: "POST", body: JSON.stringify(c) }),
  importCsv: async (brandId: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch(`${API}/brands/${brandId}/contacts/import`, { method: "POST", body: fd });
    if (!r.ok) throw new Error("import failed");
    return r.json() as Promise<{ received: number; added: number; skipped: number }>;
  },

  campaigns: (brandId: string) => req<Campaign[]>(`/brands/${brandId}/campaigns`),
  createCampaign: (brandId: string, c: Omit<Campaign, "id" | "status" | "createdAt">) =>
    req<Campaign>(`/brands/${brandId}/campaigns`, { method: "POST", body: JSON.stringify(c) }),
  sendCampaign: (
    id: string,
    filter: { plan?: string; country?: string; company?: string; includeTypes?: ContactType[] }
  ) =>
    req<{ matched: number; sent: number; skippedSuppressed: number; skippedAlready: number; failed: number; includeTypes: ContactType[] }>(
      `/campaigns/${id}/send`,
      { method: "POST", body: JSON.stringify(filter) }
    ),
  recipients: (id: string) => req<Recipient[]>(`/campaigns/${id}/recipients`),

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
};
