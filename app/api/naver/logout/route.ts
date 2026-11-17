export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { logout } from "@/lib/naver/session";

export async function POST() {
  logout();
  return NextResponse.json({ ok: true });
}
