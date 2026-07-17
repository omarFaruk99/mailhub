// Ready-made starter email designs. Single source of truth:
// - GET /starter-templates serves them to the template editor (frontend dropdown)
// - seedStarterTemplates() inserts them into a brand's gallery (auto-seed)
// Outlook-safe: table-based, inline styles. "{{name}}" is replaced per recipient.
import { prisma } from "../prisma.js";

export type StarterTemplate = { key: string; label: string; subject: string; category: string; html: string };

const outer = (inner: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f7;font-family:Arial,Helvetica,sans-serif;padding:24px 0">
  <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:100%;background:#ffffff;border-radius:12px;overflow:hidden">
      ${inner}
    </table>
  </td></tr>
</table>`;

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    key: "product-update",
    label: "Product update / New feature",
    category: "Product updates",
    subject: "🚀 What's new",
    html: outer(`
      <tr><td style="background:#6d28d9;padding:20px 32px">
        <p style="margin:0;color:#ede9fe;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Product update</p>
      </td></tr>
      <tr><td style="padding:28px 32px">
        <p style="margin:0 0 8px;font-size:15px;color:#3f3f46">Hi {{name}},</p>
        <h1 style="margin:0 0 12px;font-size:22px;font-weight:700;color:#18181b">A new feature just landed</h1>
        <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#3f3f46">Tell your customers what changed and why it helps them. Keep it short and clear.</p>
        <a href="https://example.com" style="display:inline-block;background:#6d28d9;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;border-radius:8px">See what's new</a>
      </td></tr>`),
  },
  {
    key: "newsletter",
    label: "Newsletter / Digest",
    category: "Product updates",
    subject: "📰 Your monthly update",
    html: outer(`
      <tr><td style="padding:28px 32px 8px">
        <p style="margin:0 0 8px;font-size:15px;color:#3f3f46">Hi {{name}},</p>
        <h1 style="margin:0 0 4px;font-size:22px;font-weight:700;color:#18181b">This month at Innovate</h1>
        <p style="margin:0 0 8px;font-size:14px;color:#71717a">A quick roundup of what's new.</p>
      </td></tr>
      <tr><td style="padding:8px 32px">
        <h2 style="margin:0 0 6px;font-size:17px;font-weight:700;color:#18181b">📌 Headline one</h2>
        <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#3f3f46">Short description of the first item.</p>
        <h2 style="margin:0 0 6px;font-size:17px;font-weight:700;color:#18181b">📌 Headline two</h2>
        <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#3f3f46">Short description of the second item.</p>
        <a href="https://example.com" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;border-radius:8px">Read more</a>
      </td></tr>`),
  },
  {
    key: "offer",
    label: "Marketing / Offer",
    category: "Marketing/Offers",
    subject: "🎉 A special offer for you",
    html: outer(`
      <tr><td style="padding:32px 32px 8px" align="center">
        <p style="margin:0 0 4px;font-size:15px;color:#3f3f46">Hi {{name}},</p>
        <p style="margin:4px 0 8px;font-size:38px;font-weight:800;color:#6d28d9">30% OFF</p>
        <h1 style="margin:0 0 10px;font-size:22px;font-weight:700;color:#18181b">Limited-time deal</h1>
        <p style="margin:0 0 22px;font-size:15px;line-height:1.6;color:#3f3f46">Describe the offer and when it ends. Add urgency.</p>
        <a href="https://example.com" style="display:inline-block;background:#6d28d9;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:14px 28px;border-radius:8px">Book now</a>
      </td></tr>
      <tr><td style="padding:0 32px 32px"></td></tr>`),
  },
];

// Insert the starter templates into a brand's gallery. skipDuplicates makes it
// safe to call more than once (existing names are left untouched).
export async function seedStarterTemplates(brandId: string) {
  await prisma.template.createMany({
    data: STARTER_TEMPLATES.map((s) => ({
      brandId,
      name: s.label,
      subject: s.subject,
      category: s.category,
      html: s.html,
      isStarter: true,
    })),
    skipDuplicates: true,
  });
}
