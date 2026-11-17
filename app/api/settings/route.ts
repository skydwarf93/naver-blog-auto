export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getSettings, LIMITS, resetSettings, updateSettings } from "@/lib/settings";

export async function GET() {
  return NextResponse.json({ settings: getSettings(), limits: LIMITS });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (body.reset) return NextResponse.json({ settings: resetSettings(), limits: LIMITS });
  try {
    return NextResponse.json({ settings: updateSettings(body), limits: LIMITS });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
