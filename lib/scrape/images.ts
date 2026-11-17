import fs from "node:fs";
import path from "node:path";
import type { BrowserContext, Page } from "playwright";
import { paths } from "@/lib/paths";
import { NAVER } from "@/lib/scrape/selectors";
import { judgeCrawled, verdictLabel } from "@/lib/ai/vision";
import { getDb } from "@/lib/db";

async function candidates(page: Page, url: string, max: number): Promise<string[]> {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(1200);
  await page.mouse.wheel(0, 2200); // lazy 로딩 유도
  await page.waitForTimeout(1200);
  const list = await page.evaluate(() =>
    [...document.querySelectorAll("img")]
      .filter((i) => (i as HTMLImageElement).naturalWidth >= 120)
      .map((i) => (i as HTMLImageElement).currentSrc || (i as HTMLImageElement).src || i.getAttribute("data-src") || ""),
  );
  return [...new Set(list.filter((s) => /^https?:/.test(s) && !/sprite|logo|icon|blank|\.svg/i.test(s)))].slice(0, max);
}

/** 한 자리(query)당: 네이버 → 실패 시 구글 → 하나씩 받아 AI 가 직접 보고 판정 → 첫 통과 채택 */
export async function findImageForSlot(ctx: BrowserContext, opts: {
  jobId: number; draftId: number; query: string; topic: string; index: number; max: number;
  log: (m: string, l?: "info" | "warn" | "error" | "ok") => void;
}): Promise<string | null> {
  const page = await ctx.newPage();
  const db = getDb();
  try {
    for (const [site, url] of [["naver", NAVER.imageSearch(opts.query)], ["google", NAVER.googleImage(opts.query)]] as const) {
      let list: string[] = [];
      try { list = await candidates(page, url, opts.max); } catch { continue; }
      for (let k = 0; k < list.length; k++) {
        const src = list[k];
        let buf: Buffer;
        try {
          const r = await ctx.request.get(src, { timeout: 15000 });
          if (!r.ok()) continue;
          buf = await r.body();
        } catch { continue; }
        if (buf.length < 3000) continue; // 아이콘/깨진 이미지
        const ext = /png/i.test(src) ? "png" : /webp/i.test(src) ? "webp" : "jpg";
        const file = path.join(paths.images, `job${opts.jobId}-s${opts.index}-${site}-${k}.${ext}`);
        fs.writeFileSync(file, buf);
        const v = await judgeCrawled(file, opts.topic, opts.query);
        // 탈락한 이미지도 기록 — 필터가 실제 동작하는지 사용자가 확인할 유일한 통로
        db.prepare("INSERT INTO images (job_id, draft_id, query, src_url, local_path, source_site, verdict_ok, verdict_reason, section_index) VALUES (?,?,?,?,?,?,?,?,?)")
          .run(opts.jobId, opts.draftId, opts.query, src, file, site, v.fit ? 1 : 0, verdictLabel(v), opts.index);
        if (v.fit) return file;
        if (/session limit|hit your/i.test(v.reason)) { opts.log("오늘 AI 사용량을 다 써서 사진 고르기를 멈춥니다", "warn"); return null; }
      }
    }
    return null;
  } finally {
    await page.close().catch(() => {});
  }
}
