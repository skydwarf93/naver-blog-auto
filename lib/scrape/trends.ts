import type { Page } from "playwright";
import { newContext } from "@/lib/playwright";
import { NAVER, SCRAPE } from "@/lib/scrape/selectors";
import type { Source } from "@/lib/types";

// 셀렉터에 의존하지 않는다. 네이버 검색 DOM 은 자주 바뀌므로 모든 a[href] 를 훑는 일반 추출.
interface RawLink { href: string; text: string; around: string }

async function collectLinks(page: Page): Promise<RawLink[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll("a[href]")].map((a) => {
      const el = a as HTMLAnchorElement;
      const text = (el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
      const box = el.closest("li, div");
      const around = (box?.textContent || "").replace(/\s+/g, " ").trim();
      return { href: el.href, text, around };
    }),
  );
}

/** 순수 함수: 링크 목록 → 정제된 자료 (테스트 가능하게 분리) */
export function filterLinks(links: RawLink[], type: "news" | "blog"): Source[] {
  const byUrl = new Map<string, Source>();
  for (const l of links) {
    const href = l.href.split("#")[0];
    if (SCRAPE.excludeHref.some((re) => re.test(href))) continue;
    const isMatch = type === "news"
      ? /news\.naver\.com|\/news\/|n\.news/.test(href)
      : NAVER.blogPostHrefRe.test(href); // 블로그 홈 링크 제외
    if (!isMatch) continue;
    // ⚠️ '새 창 열림' 을 먼저 지운 뒤 길이·노이즈 필터
    const title = l.text.replace(SCRAPE.srText, "").replace(/\s+/g, " ").trim();
    if (title.length < 8 || SCRAPE.noiseText.test(title)) continue;
    let summary = l.around.replace(SCRAPE.srText, "");
    if (l.text) summary = summary.split(l.text).join(" ");
    summary = summary.replace(/\s+/g, " ").trim().slice(0, 260);
    const prev = byUrl.get(href);
    // 같은 기사가 [제목 링크] + [본문 스니펫 링크] 로 두 번 잡힌다 → 제목이 더 짧은 쪽(스니펫은 길고 문장형)
    if (!prev || title.length < prev.title.length) {
      byUrl.set(href, { type, title, summary: prev && prev.summary.length > summary.length ? prev.summary : summary, url: href });
    }
  }
  const seen = new Set<string>();
  const out: Source[] = [];
  for (const s of byUrl.values()) {
    s.summary = s.summary.split(s.title).join(" ").replace(/\s+/g, " ").trim(); // 요약에 제목이 반복되지 않게
    const key = s.title.slice(0, 40);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

export async function scrapeTrends(keyword: string, topN: number, headless = true): Promise<Source[]> {
  const { browser, context } = await newContext({ headless });
  try {
    const page = await context.newPage();
    const result: Source[] = [];
    for (const [type, url] of [["news", NAVER.newsSearch(keyword)], ["blog", NAVER.blogSearch(keyword)]] as const) {
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        await page.waitForTimeout(1200);
        result.push(...filterLinks(await collectLinks(page), type).slice(0, topN));
      } catch { /* 한쪽이 실패해도 나머지는 쓴다 */ }
    }
    return result;
  } finally {
    await browser.close().catch(() => {});
  }
}
