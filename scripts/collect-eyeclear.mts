import fs from "node:fs";
import { newContext } from "@/lib/playwright";
import { filterLinks } from "@/lib/scrape/trends";
const { browser, context } = await newContext({ headless: true });
const page = await context.newPage();
const seen = new Map<string, { title: string; summary: string; url: string }>();
const stores = new Set<string>();
const qs = ["아이클리어 루테인지아잔틴 미니캡슐", "아이클리어 루테인지아잔틴 미니캡슐 후기", "종근당 아이클리어 루테인지아잔틴 후기", "종근당건강 아이클리어 미니캡슐", "아이클리어 루테인 미니캡슐 후기"];
for (const q of qs) for (const extra of ["", "&nso=so:dd,p:all"]) {
  for (const tab of ["ssc=tab.blog.all", "where=nexearch"]) {
    await page.goto(`https://search.naver.com/search.naver?${tab}&query=${encodeURIComponent(q)}${extra}`, { waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForTimeout(1200); await page.mouse.wheel(0, 3000); await page.waitForTimeout(700);
    const links = await page.evaluate(() => [...document.querySelectorAll("a[href]")].map((a) => ({ href: (a as HTMLAnchorElement).href, text: ((a as HTMLElement).innerText || "").replace(/\s+/g, " ").trim(), around: (a.closest("li, div")?.textContent || "").replace(/\s+/g, " ").trim() })));
    for (const l of links) if (/brand\.naver\.com\/[^/]+\/products\/\d+|smartstore\.naver\.com\/[^/]+\/products\/\d+/.test(l.href) && /아이클리어|루테인/.test(l.text + l.around.slice(0, 200))) stores.add(l.href.split("?")[0] + " :: " + l.text.slice(0, 60));
    for (const s of filterLinks(links, "blog")) if (/아이클리어/.test(s.title + s.summary) && /미니/.test(s.title + s.summary) && s.summary.length > 40 && !seen.has(s.url)) seen.set(s.url, s);
  }
}
await browser.close();
const list = [...seen.values()];
fs.writeFileSync("data/reviews-eyeclear.json", JSON.stringify(list, null, 2));
console.log("스토어 후보:", [...stores].slice(0, 15).join("\n"));
console.log("후기", list.length);
for (const [i, s] of list.entries()) console.log(`\n[${i + 1}] ${s.title}\n${s.url}\n${s.summary.slice(0, 280)}`);
