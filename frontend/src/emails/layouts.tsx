// Email layouts (the "moulds"). A developer edits these; teams only fill the fields.
// Rendered to Outlook-safe HTML by React Email (see app/api/render-template/route.ts).
// NOTE: personalization uses the literal "{{name}}" merge tag — the backend replaces it
// per recipient at send time. In JSX we must write it as {"{{name}}"} so it stays literal.
import {
  Body, Container, Head, Heading, Hr, Html, Img, Button, Section, Text,
} from "@react-email/components";
import * as React from "react";

// ---- Shared field metadata (used to build the fill-in form in the UI) ----
export type FieldType = "text" | "textarea" | "url";
export type FieldDef = { key: string; label: string; type: FieldType; placeholder?: string; optional?: boolean };
export type LayoutMeta = { key: string; label: string; description: string; fields: FieldDef[] };

export type Fields = Record<string, string>;

const wrap: React.CSSProperties = { backgroundColor: "#f5f5f7", fontFamily: "Arial, sans-serif", padding: "24px 0" };
const card: React.CSSProperties = { backgroundColor: "#ffffff", borderRadius: "12px", maxWidth: "560px", margin: "0 auto", padding: "32px" };
const h1: React.CSSProperties = { fontSize: "22px", fontWeight: 700, color: "#18181b", margin: "0 0 12px" };
const p: React.CSSProperties = { fontSize: "15px", lineHeight: "1.6", color: "#3f3f46", margin: "0 0 16px", whiteSpace: "pre-line" };
const btn: React.CSSProperties = { backgroundColor: "#6d28d9", color: "#ffffff", borderRadius: "8px", padding: "12px 20px", fontSize: "15px", fontWeight: 600, textDecoration: "none" };
const greeting: React.CSSProperties = { ...p, marginBottom: "8px" };

// ---- Announcement layout ----
function Announcement(f: Fields) {
  return (
    <Html>
      <Head />
      <Body style={wrap}>
        <Container style={card}>
          {f.imageUrl ? <Img src={f.imageUrl} alt="" width="100%" style={{ borderRadius: "8px", marginBottom: "20px" }} /> : null}
          <Text style={greeting}>Hi {"{{name}}"},</Text>
          <Heading style={h1}>{f.title || "Title goes here"}</Heading>
          <Text style={p}>{f.body || "Body text goes here."}</Text>
          {f.buttonText ? (
            <Section style={{ margin: "8px 0" }}>
              <Button href={f.buttonUrl || "#"} style={btn}>{f.buttonText}</Button>
            </Section>
          ) : null}
          <Hr style={{ borderColor: "#e4e4e7", margin: "24px 0 12px" }} />
        </Container>
      </Body>
    </Html>
  );
}

const announcementFields: FieldDef[] = [
  { key: "title", label: "Title", type: "text", placeholder: "New Dark Mode is here!" },
  { key: "body", label: "Body text", type: "textarea", placeholder: "Write your message…" },
  { key: "imageUrl", label: "Image link (URL)", type: "url", placeholder: "https://…/banner.png", optional: true },
  { key: "buttonText", label: "Button text", type: "text", placeholder: "Try it now", optional: true },
  { key: "buttonUrl", label: "Button link (URL)", type: "url", placeholder: "https://…", optional: true },
];

const eyebrow: React.CSSProperties = { fontSize: "12px", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#6d28d9", margin: "0 0 8px" };
const offer: React.CSSProperties = { fontSize: "34px", fontWeight: 800, color: "#6d28d9", margin: "4px 0 12px" };

// ---- Product update layout (a small tag/eyebrow on top) ----
function ProductUpdate(f: Fields) {
  return (
    <Html>
      <Head />
      <Body style={wrap}>
        <Container style={card}>
          {f.imageUrl ? <Img src={f.imageUrl} alt="" width="100%" style={{ borderRadius: "8px", marginBottom: "20px" }} /> : null}
          <Text style={eyebrow}>{f.tag || "PRODUCT UPDATE"}</Text>
          <Heading style={h1}>{f.title || "What's new"}</Heading>
          <Text style={greeting}>Hi {"{{name}}"},</Text>
          <Text style={p}>{f.body || "Body text goes here."}</Text>
          {f.buttonText ? (
            <Section style={{ margin: "8px 0" }}>
              <Button href={f.buttonUrl || "#"} style={btn}>{f.buttonText}</Button>
            </Section>
          ) : null}
          <Hr style={{ borderColor: "#e4e4e7", margin: "24px 0 12px" }} />
        </Container>
      </Body>
    </Html>
  );
}

const productUpdateFields: FieldDef[] = [
  { key: "tag", label: "Top label", type: "text", placeholder: "NEW FEATURE", optional: true },
  { key: "title", label: "Title", type: "text", placeholder: "Dark mode has arrived" },
  { key: "body", label: "Body text", type: "textarea", placeholder: "Describe the update…" },
  { key: "imageUrl", label: "Image link (URL)", type: "url", placeholder: "https://…/screenshot.png", optional: true },
  { key: "buttonText", label: "Button text", type: "text", placeholder: "See what's new", optional: true },
  { key: "buttonUrl", label: "Button link (URL)", type: "url", placeholder: "https://…", optional: true },
];

// ---- Promo / Offer layout (big offer text) ----
function Promo(f: Fields) {
  return (
    <Html>
      <Head />
      <Body style={wrap}>
        <Container style={card}>
          {f.imageUrl ? <Img src={f.imageUrl} alt="" width="100%" style={{ borderRadius: "8px", marginBottom: "20px" }} /> : null}
          <Text style={greeting}>Hi {"{{name}}"},</Text>
          {f.offer ? <Text style={offer}>{f.offer}</Text> : null}
          <Heading style={h1}>{f.title || "A special offer for you"}</Heading>
          <Text style={p}>{f.body || "Body text goes here."}</Text>
          {f.buttonText ? (
            <Section style={{ margin: "8px 0" }}>
              <Button href={f.buttonUrl || "#"} style={btn}>{f.buttonText}</Button>
            </Section>
          ) : null}
          <Hr style={{ borderColor: "#e4e4e7", margin: "24px 0 12px" }} />
        </Container>
      </Body>
    </Html>
  );
}

const promoFields: FieldDef[] = [
  { key: "offer", label: "Offer (big text)", type: "text", placeholder: "30% OFF", optional: true },
  { key: "title", label: "Title", type: "text", placeholder: "Limited-time deal" },
  { key: "body", label: "Body text", type: "textarea", placeholder: "Describe the offer…" },
  { key: "imageUrl", label: "Image link (URL)", type: "url", placeholder: "https://…/promo.png", optional: true },
  { key: "buttonText", label: "Button text", type: "text", placeholder: "Shop now", optional: true },
  { key: "buttonUrl", label: "Button link (URL)", type: "url", placeholder: "https://…", optional: true },
];

// ---- Registry: layoutKey -> component + metadata ----
export const LAYOUTS: Record<string, { meta: LayoutMeta; component: (f: Fields) => React.ReactElement }> = {
  announcement: {
    component: Announcement,
    meta: { key: "announcement", label: "Announcement", description: "Title + text + optional image and button.", fields: announcementFields },
  },
  "product-update": {
    component: ProductUpdate,
    meta: { key: "product-update", label: "Product update", description: "A top label, title, text, optional image and button.", fields: productUpdateFields },
  },
  promo: {
    component: Promo,
    meta: { key: "promo", label: "Promo / Offer", description: "A big offer line, title, text, optional image and button.", fields: promoFields },
  },
};

// Serializable metadata for the UI (no components).
export const LAYOUT_META: LayoutMeta[] = Object.values(LAYOUTS).map((l) => l.meta);
