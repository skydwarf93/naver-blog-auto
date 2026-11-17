import { scrapeTrends } from "@/lib/scrape/trends";
const r = await scrapeTrends(process.argv[2] || "홈카페", 8);
console.log("news", r.filter(s=>s.type==="news").length, "blog", r.filter(s=>s.type==="blog").length);
for (const s of r) console.log(s.type, "|", s.title.slice(0,50), "|", s.url.slice(0,70), "|", s.summary.slice(0,40));
const bad = r.filter(s => /새 ?창 ?열림/.test(s.title) || /help\.naver/.test(s.url));
const urls = r.map(s=>s.url); console.log("noise", bad.length, "dupUrls", urls.length - new Set(urls).size);
