import fs from "node:fs";
import { newContext } from "@/lib/playwright";
import { filterLinks } from "@/lib/scrape/trends";
const prev: Array<{ title: string; summary: string; url: string }> = JSON.parse(fs.readFileSync("data/reviews.json", "utf8"));
const seen = new Map(prev.map((p) => [p.url, p]));
const { browser, context } = await newContext({ headless: true });
const page = await context.newPage();
const qs = ["랩온랩 이노시톨", "랩온랩 미오이노시톨", "랩온랩 이노시톨 내돈내산", "랩온랩 미오 이노시톨 4000 후기", "랩온랩 이노시톨 맛", "랩온랩 이노시톨 4000 30포"];
for (const q of qs) for (const extra of ["", "&nso=so:dd,p:all", "&start=31"]) {
  await page.goto(`https://search.naver.com/search.naver?ssc=tab.blog.all&query=${encodeURIComponent(q)}${extra}`, { waitUntil: "domcontentloaded" }).catch(() => {});
  await page.waitForTimeout(1300);
  await page.mouse.wheel(0, 3000); await page.waitForTimeout(800);
  const links = await page.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => ({ href: (a as HTMLAnchorElement).href, text: ((a as HTMLElement).innerText || "").replace(/\s+/g, " ").trim(), around: (a.closest("li, div")?.textContent || "").replace(/\s+/g, " ").trim() })));
  for (const s of filterLinks(links, "blog")) if (/랩온랩/.test(s.title + s.summary) && s.summary.length > 40 && !seen.has(s.url)) seen.set(s.url, s);
}
await browser.close();
const list = [...seen.values()];
fs.writeFileSync("data/reviews.json", JSON.stringify(list, null, 2));
console.log("총", list.length);
for (const [i, s] of list.entries()) console.log(`\n[${i + 1}] ${s.title}\n${s.url}\n${s.summary.slice(0, 260)}`);
