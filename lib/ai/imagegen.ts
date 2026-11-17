import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { config, hasCloudflare } from "@/config";
import { runClaudeJson } from "@/lib/claude";
import { getDb } from "@/lib/db";
import { paths } from "@/lib/paths";
import { neuronsPerImage } from "@/lib/ai/neurons";
import { judgeGenerated } from "@/lib/ai/vision";
import type { ImageStyle } from "@/lib/types";

const STYLE_TOKENS: Record<ImageStyle, string> = {
  photo: "photorealistic photograph, natural lighting, shallow depth of field, 50mm lens, high detail",
  illust: "clean flat vector illustration, simple shapes, soft muted color palette, minimal, lots of white space",
};
const TAIL = "no text, no letters, no words, no watermark, no logo";

/** ① claude 가 FLUX 용 영문 프롬프트를 설계 */
export async function designPrompt(title: string, scene: string, context: string, style: ImageStyle, feedback?: string) {
  const prompt = `블로그 글 "${title}" 에 들어갈 이미지의 FLUX 프롬프트를 설계하라.
그 자리의 장면 설명: ${scene}
앞뒤 문단 맥락: ${context.slice(0, 400)}
${feedback ? `이전 생성물의 문제: ${feedback} — 이 문제가 다시 생기지 않게 고쳐라.` : ""}
규칙:
- 영어, 한 문단, 40단어 이내
- 피사체 / 구도 / 조명 / 배경 / 질감을 명시
- 다음 스타일 토큰을 반드시 포함: "${STYLE_TOKENS[style]}"
- 끝에 반드시: "${TAIL}"
- 실존 인물·유명인·브랜드 로고 금지
- 사람이 필요하면 얼굴이 크게 안 나오는 구도(손·뒷모습·실루엣)
- 한국적 맥락은 반영하되 한글 간판·글자는 넣지 마라
출력: {"prompt":"..."}`;
  const r = await runClaudeJson(prompt, z.object({ prompt: z.string().min(10) }));
  if (!r.ok) return r;
  let p = r.data.prompt.trim();
  if (!p.includes(STYLE_TOKENS[style])) p += ", " + STYLE_TOKENS[style];
  if (!p.toLowerCase().includes("no watermark")) p += ", " + TAIL;
  return { ok: true as const, data: p };
}

/** ② Cloudflare Workers AI 로 생성. 응답은 바이너리가 아니라 base64 JSON 이다(FLUX). SDXL 계열은 바이너리 */
export async function cfGenerate(prompt: string, steps: number): Promise<{ ok: true; buf: Buffer } | { ok: false; error: string }> {
  if (!hasCloudflare()) return { ok: false, error: "Cloudflare 키 없음" };
  const url = `https://api.cloudflare.com/client/v4/accounts/${config.cfAccountId}/ai/run/${config.cfModel}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 90_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.cfApiToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, steps: Math.min(Math.max(steps, 1), 8) }),
      signal: ctrl.signal,
    });
    const ct = res.headers.get("content-type") || "";
    let buf: Buffer;
    if (ct.includes("application/json")) {
      const j = (await res.json()) as { success?: boolean; result?: { image?: string }; errors?: Array<{ message: string }> };
      if (!res.ok || !j.result?.image) return { ok: false, error: j.errors?.map((e) => e.message).join("; ") || `HTTP ${res.status}` };
      buf = Buffer.from(j.result.image, "base64");
    } else {
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      buf = Buffer.from(await res.arrayBuffer());
    }
    if (buf.length < 2000) return { ok: false, error: "생성 결과가 너무 작음(실패)" };
    return { ok: true, buf };
  } catch (e) {
    return { ok: false, error: (e as Error).name === "AbortError" ? "생성 시간 초과(90초)" : (e as Error).message };
  } finally {
    clearTimeout(t);
  }
}

/** ①→②→③. 부적합하면 그 이유를 되먹여 1회만 재생성(무한 루프 금지) */
export async function generateForSlot(opts: {
  jobId: number; title: string; scene: string; context: string; style: ImageStyle; steps: number; index: number;
  log: (m: string, l?: "info" | "warn" | "error" | "ok") => void;
}): Promise<{ path: string; prompt: string } | null> {
  let feedback: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    const d = await designPrompt(opts.title, opts.scene, opts.context, opts.style, feedback);
    if (!d.ok) { opts.log(`사진 ${opts.index + 1}: 그림 설명 만들기 실패 — ${d.error.slice(0, 80)}`, "warn"); return null; }
    const g = await cfGenerate(d.data, opts.steps);
    if (!g.ok) { opts.log(`사진 ${opts.index + 1}: 생성 실패 — ${g.error}`, "warn"); return null; }
    getDb().prepare("INSERT INTO neuron_log (job_id, steps, neurons) VALUES (?, ?, ?)").run(opts.jobId, opts.steps, neuronsPerImage(opts.steps));
    const file = path.join(paths.images, `job${opts.jobId}-ai-${opts.index}-${attempt}-${Date.now()}.png`);
    fs.writeFileSync(file, g.buf);
    const v = await judgeGenerated(file, opts.scene);
    if (v.ok) return { path: file, prompt: d.data };
    feedback = `${v.problem}: ${v.reason}`;
    opts.log(`사진 ${opts.index + 1}: ${attempt === 0 ? "다시 그립니다" : "건너뜁니다"} (${v.reason.slice(0, 80)})`, "warn");
    getDb().prepare("INSERT INTO images (job_id, query, local_path, source_site, verdict_ok, verdict_reason, section_index, gen_prompt) VALUES (?,?,?,?,0,?,?,?)")
      .run(opts.jobId, opts.scene, file, "ai", feedback, opts.index, d.data);
  }
  return null;
}
