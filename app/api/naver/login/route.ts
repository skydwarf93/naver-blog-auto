export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 600;
import { NextResponse } from "next/server";
import { loginInteractive } from "@/lib/naver/session";

export async function POST() {
  return NextResponse.json(await loginInteractive());
}
