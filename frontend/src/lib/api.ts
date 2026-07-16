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
};
