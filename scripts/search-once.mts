import { scrapeTrends } from "@/lib/scrape/trends";
for (const q of process.argv.slice(2)) {
  const r = await scrapeTrends(q, 8);
  console.log(`\n### ${q} → ${r.length}건`);
  for (const s of r) console.log(`- [${s.type}] ${s.title} :: ${s.summary.slice(0, 160)}`);
}
