// Returns the available email layouts + their field definitions (metadata only,
// no components) so the Templates UI can build the fill-in form.
import { NextResponse } from "next/server";
import { LAYOUT_META } from "@/emails/layouts";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(LAYOUT_META);
}
