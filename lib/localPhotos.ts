import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { runClaudeJson } from "@/lib/claude";

const EXT = /\.(jpe?g|png|webp|heic)$/i;

export function expandHome(p: string) {
  return p.startsWith("~") ? path.join(os.homedir(), p.slice(1)) : p;
}

export function listLocalPhotos(dir: string): string[] {
  const d = path.resolve(expandHome(dir.trim()));
  if (!fs.existsSync(d) || !fs.statSync(d).isDirectory()) throw new Error("사진 폴더를 찾을 수 없습니다: " + dir);
  return fs.readdirSync(d)
    .filter((f) => EXT.test(f))
    .sort((a, b) => a.localeCompare(b, "ko", { numeric: true })) // 파일명 자연순
    .map((f) => path.join(d, f));
}

/** 사진마다 한 줄 설명(30자). 본문 생성 전에 "한 번만" 만들고 프롬프트와 배치에 재사용한다 */
export async function describePhotos(photos: string[]): Promise<string[]> {
  const out: string[] = [];
  for (const p of photos) {
    const r = await runClaudeJson("첨부 사진을 30자 이내 한국어 한 줄로 설명하라. 출력: {\"desc\":\"...\"}",
      z.object({ desc: z.string() }), { images: [p], retries: 1 });
    out.push(r.ok ? r.data.desc.slice(0, 40) : path.basename(p));
  }
  return out;
}

/** 각 이미지 자리에 사진을 배치. ai 매칭 실패·누락분은 순서대로 채운다 */
export async function placePhotos(slots: string[], photos: string[], descs: string[], mode: "order" | "ai"): Promise<string[]> {
  const result: (string | null)[] = slots.map(() => null);
  const used = new Set<number>();
  if (mode === "ai" && photos.length) {
    const prompt = `사진 목록:\n${descs.map((d, i) => `${i}. ${d}`).join("\n")}\n\n자리 목록:\n${slots.map((s, i) => `${i}. ${s}`).join("\n")}
각 자리에 가장 어울리는 사진 번호를 하나씩, 겹치지 않게 골라라. 출력: {"map":[사진번호, ...]} (자리 순서대로)`;
    const r = await runClaudeJson(prompt, z.object({ map: z.array(z.number().int()) }), { retries: 1 });
    if (r.ok) r.data.map.forEach((pi, si) => {
      if (si < slots.length && pi >= 0 && pi < photos.length && !used.has(pi)) { result[si] = photos[pi]; used.add(pi); }
    });
  }
  const rest = photos.filter((_, i) => !used.has(i));
  return result.map((r) => r ?? rest.shift() ?? null).filter((x): x is string => Boolean(x));
}
