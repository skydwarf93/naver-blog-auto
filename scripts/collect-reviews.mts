import fs from "node:fs";
import { scrapeTrends } from "@/lib/scrape/trends";
const qs = ["랩온랩 미오이노시톨 후기", "랩온랩 이노시톨 4000 후기", "랩온랩 미오 이노시톨 4000", "미오이노시톨 콜린&알파 4000 후기", "랩온랩 이노시톨 질유래유산균"];
const seen = new Map<string, { title: string; summary: string; url: string }>();
for (const q of qs) {
  const r = await scrapeTrends(q, 15);
  for (const s of r) if (s.type === "blog" && /랩온랩|LAB ?ON ?LAB|콜린&알파|콜린 ?& ?알파/i.test(s.title + s.summary) && s.summary.length > 40 && !seen.has(s.url)) seen.set(s.url, s);
}
const list = [...seen.values()];
fs.writeFileSync("data/reviews.json", JSON.stringify(list, null, 2));
console.log(list.length);
for (const [i, s] of list.entries()) console.log(`\n[${i + 1}] ${s.title}\n${s.url}\n${s.summary}`);
