export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getNeuronUsage } from "@/lib/ai/cfUsage";
import { getSettings } from "@/lib/settings";

export async function GET() {
  const db = getDb();
  // ⚠️ 7-22: 양쪽 다 localtime
  const today = (db.prepare("SELECT COUNT(*) AS n FROM posts WHERE status='published' AND date(published_at,'localtime') = date('now','localtime')").get() as { n: number }).n;
  const last = db.prepare("SELECT published_at FROM posts WHERE status='published' ORDER BY published_at DESC LIMIT 1").get() as { published_at: string } | undefined;
  const neurons = await getNeuronUsage();
  const s = getSettings();
  return NextResponse.json({ publishedToday: today, dailyLimit: s.dailyPublishLimit, lastPublishedAt: last?.published_at ?? null, neurons });
}
