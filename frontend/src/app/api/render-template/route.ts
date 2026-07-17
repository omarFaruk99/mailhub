// Renders a layout + field values into Outlook-safe HTML using React Email.
// Runs server-side (Node) so React Email's render() is available.
import { NextResponse } from "next/server";
import { render } from "@react-email/render";
import { LAYOUTS, type Fields } from "@/emails/layouts";

export const runtime = "nodejs";

export async function POST(req: Request) {
  let body: { layoutKey?: string; fields?: Fields };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const layout = body.layoutKey ? LAYOUTS[body.layoutKey] : undefined;
  if (!layout) return NextResponse.json({ error: "unknown layoutKey" }, { status: 400 });

  const html = await render(layout.component(body.fields ?? {}));
  return NextResponse.json({ html });
}
