// The shared vocabulary of "who receives this" — the contact types and the filter
// shape. It lives in its own file with no imports so that both send-campaign.ts
// and audience.ts can use it: send-campaign imports audience, so audience must
// not import send-campaign back.
export const CONTACT_TYPES = ["client", "prospect", "internal"] as const;
export type ContactType = (typeof CONTACT_TYPES)[number];

/** An audience rule. A blank/absent field means "any" — it narrows nothing. */
export type SendFilter = {
  plan?: string;
  country?: string;
  company?: string;
  includeTypes?: ContactType[];
};
