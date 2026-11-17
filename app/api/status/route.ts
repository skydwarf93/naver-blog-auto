export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import fs from "node:fs";
import { hasCloudflare } from "@/config";
import { checkClaude } from "@/lib/claude";
import { invalidateSessionCache, verifySession } from "@/lib/naver/session";
import { getSettings, LIMITS } from "@/lib/settings";
import { paths } from "@/lib/paths";

let claudeCache: { at: number; v: Awaited<ReturnType<typeof checkClaude>> } | null = null;

export async function GET(req: Request) {
  const refresh = new URL(req.url).searchParams.get("refresh") === "1";
  if (refresh) { invalidateSessionCache(); claudeCache = null; }
  if (!claudeCache || Date.now() - claudeCache.at > 60_000) claudeCache = { at: Date.now(), v: await checkClaude() };
  const hasSessionFile = fs.existsSync(paths.session);
  const naver = hasSessionFile ? await verifySession() : { valid: false, reason: "로그인 기록 없음" };
  return NextResponse.json({
    claude: claudeCache.v,
    naver,
    cloudflare: hasCloudflare(),
    settings: getSettings(),
    limits: LIMITS,
    platform: process.platform,
  });
}
