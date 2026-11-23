// 사용법: npx tsx scripts/collect-generic.mts <출력json> <제품 필수어 정규식> <검색어1> <검색어2> ...
import fs from "node:fs";
import { newContext } from "@/lib/playwright";
import { filterLinks } from "@/lib/scrape/trends";
const [out, must, ...qs] = process.argv.slice(2);
const mustRe = new RegExp(must);
const { browser, context } = await newContext({ headless: true });
const page = await context.newPage();
const seen = new Map<string, { title: string; summary: string; url: string }>();
const stores = new Map<string, string>();
for (const q of qs) for (const tab of ["ssc=tab.blog.all", "ssc=tab.blog.all&nso=so:dd,p:all", "where=nexearch", "ssc=tab.shopping.all"]) {
  await page.goto(`https://search.naver.com/search.naver?${tab}&query=${encodeURIComponent(q)}`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(1300); await page.mouse.wheel(0, 3000); await page.waitForTimeout(700);
  const links = await page.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => ({ href: (a as HTMLAnchorElement).href, text: ((a as HTMLElement).innerText || "").replace(/\s+/g, " ").trim(), around: (a.closest("li, div")?.textContent || "").replace(/\s+/g, " ").trim() })));
  for (const l of links) if (/(brand|smartstore)\.naver\.com\/[^/?]+\/products\/\d+/.test(l.href)) stores.set(l.href.split("?")[0], (l.text || l.around).slice(0, 90));
  for (const s of filterLinks(links, "blog")) if (mustRe.test(s.title + s.summary) && s.summary.length > 40 && !seen.has(s.url)) seen.set(s.url, s);
}
await browser.close();
const list = [...seen.values()];
fs.writeFileSync(out, JSON.stringify({ reviews: list, stores: [...stores] }, null, 2));
console.log("스토어:"); for (const [h, t] of stores) console.log(" ", h, "::", t);
console.log("후기", list.length);
for (const [i, s] of list.entries()) console.log(`\n[${i + 1}] ${s.title}\n${s.url}\n${s.summary.slice(0, 260)}`);
