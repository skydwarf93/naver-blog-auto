import { spawn } from "node:child_process";
import type { z } from "zod";
import { config } from "@/config";
import { getSettings } from "@/lib/settings";

// 2-1: Anthropic API(종량 과금) 대신 로컬 claude CLI → 사용자의 구독 요금제로 동작한다.
// 프롬프트는 반드시 stdin 으로. argv 로 넘기면 긴 한글에서 escaping 이 깨진다.

const isWin = process.platform === "win32";

// ---- 동시성 세마포어: 한도는 "호출 시점에" 설정에서 읽는다(설정 변경 즉시 반영)
let active = 0;
const waiters: Array<() => void> = [];
async function acquire() {
  for (;;) {
    if (active < getSettings().claudeConcurrency) { active++; return; }
    await new Promise<void>((r) => waiters.push(r));
  }
}
function release() {
  active--;
  const w = waiters.shift();
  if (w) w();
}

export type ClaudeResult = { ok: true; text: string } | { ok: false; error: string };

// 호출 횟수(검증용: 로컬 사진 설명이 한 번만 만들어지는지 등)
export const claudeStats = { calls: 0 };

function binCandidates(): string[] {
  const b = config.claudeBin;
  if (!isWin) return [b];
  return [b, `${b}.cmd`, `${b}.exe`];
}

function runOnce(bin: string, full: string, timeoutMs: number): Promise<ClaudeResult & { enoent?: boolean }> {
  return new Promise((resolve) => {
    let out = "", err = "", done = false;
    // ⚠️ 윈도우: npm 전역 바이너리는 claude.cmd 셸 심이라 spawn 이 ENOENT 로 죽는다 → shell:true.
    //    argv 에는 고정 옵션만 있고 사용자 입력은 stdin 으로 가므로 셸 인용 문제가 없다(미검증).
    const p = spawn(bin, ["-p", "--output-format", "json"], { shell: isWin, stdio: ["pipe", "pipe", "pipe"] });
    const t = setTimeout(() => {
      if (done) return;
      done = true;
      p.kill("SIGKILL");
      resolve({ ok: false, error: `AI 응답 대기 시간 초과(${Math.round(timeoutMs / 1000)}초)` });
    }, timeoutMs);
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (err += d));
    p.on("error", (e: NodeJS.ErrnoException) => {
      if (done) return;
      done = true; clearTimeout(t);
      resolve({ ok: false, error: e.message, enoent: e.code === "ENOENT" });
    });
    p.on("close", (code) => {
      if (done) return;
      done = true; clearTimeout(t);
      const raw = out.trim();
      try {
        const j = JSON.parse(raw);
        // 응답엔 usage, modelUsage 등 필드가 20개 넘게 더 있다 — .result 만 읽으면 된다
        if (j.is_error) return resolve({ ok: false, error: String(j.result || j.error || "claude 오류") });
        return resolve({ ok: true, text: String(j.result ?? "") });
      } catch {
        if (code === 0 && raw) return resolve({ ok: true, text: raw }); // JSON 이 아니면 raw 폴백
        resolve({ ok: false, error: (err || raw || `claude 종료 코드 ${code}`).slice(0, 500) });
      }
    });
    p.stdin.on("error", () => {});
    p.stdin.write(full);
    p.stdin.end();
  });
}

export async function runClaude(prompt: string, opts?: { images?: string[]; system?: string }): Promise<ClaudeResult> {
  let full = opts?.system ? `${opts.system}\n\n${prompt}` : prompt;
  // 비전: 프롬프트 끝에 @/절대/경로 를 붙이면 claude 가 이미지를 읽는다
  if (opts?.images?.length) full += "\n\n" + opts.images.map((p) => `@${p}`).join(" ");
  await acquire();
  try {
    claudeStats.calls++;
    const timeoutMs = getSettings().claudeTimeoutSec * 1000;
    let last: ClaudeResult = { ok: false, error: "claude 를 찾을 수 없습니다" };
    for (const bin of binCandidates()) {
      const r = await runOnce(bin, full, timeoutMs);
      if (r.ok || !r.enoent) return r.ok ? { ok: true, text: r.text } : { ok: false, error: r.error };
      last = { ok: false, error: `ENOENT: ${bin}` };
    }
    return last;
  } finally {
    release();
  }
}

const JSON_SYSTEM =
  "반드시 유효한 JSON 만 출력하라. 설명/마크다운/코드펜스 없이 JSON 객체 또는 배열만 반환하라.";

/** AI 는 지시해도 앞뒤에 말을 붙인다 → ①코드펜스 ②첫 { 또는 [ 부터 짝이 맞는 끝까지 */
export function extractJson(text: string): string | null {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence && /^[\s]*[[{]/.test(fence[1])) return fence[1].trim();
  const start = text.search(/[[{]/);
  if (start < 0) return null;
  const open = text[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === open) depth++;
    else if (c === close && --depth === 0) return text.slice(start, i + 1);
  }
  const last = text.lastIndexOf(close);
  return last > start ? text.slice(start, last + 1) : null;
}

export async function runClaudeJson<T>(
  prompt: string,
  schema: z.ZodType<T>,
  opts?: { images?: string[]; system?: string; retries?: number },
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  const retries = opts?.retries ?? 2;
  const system = [opts?.system, JSON_SYSTEM].filter(Boolean).join("\n\n");
  let lastErr = "";
  for (let attempt = 0; attempt <= retries; attempt++) {
    const extra = attempt > 0 && lastErr ? `\n\n[이전 응답이 거절된 이유: ${lastErr.slice(0, 400)}] 이 문제를 고쳐 다시 출력하라.` : "";
    const r = await runClaude(prompt + extra, { images: opts?.images, system });
    if (!r.ok) {
      lastErr = r.error;
      if (/session limit|usage limit|hit your/i.test(r.error)) break; // 한도 초과는 재시도해도 소용없다
      continue;
    }
    const js = extractJson(r.text);
    if (!js) { lastErr = "JSON 을 찾을 수 없음"; continue; }
    let parsed: unknown;
    try { parsed = JSON.parse(js); } catch (e) { lastErr = "JSON 파싱 실패: " + (e as Error).message; continue; }
    const v = schema.safeParse(parsed);
    if (v.success) return { ok: true, data: v.data };
    lastErr = "형식 검증 실패: " + v.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ");
  }
  return { ok: false, error: lastErr };
}

export async function checkClaude(): Promise<{ ok: boolean; version?: string; error?: string }> {
  for (const bin of binCandidates()) {
    const r = await new Promise<{ ok: boolean; version?: string; error?: string; enoent?: boolean }>((resolve) => {
      const p = spawn(bin, ["--version"], { shell: isWin });
      let out = "";
      const t = setTimeout(() => { p.kill("SIGKILL"); resolve({ ok: false, error: "응답 없음" }); }, 15000);
      p.stdout.on("data", (d) => (out += d));
      p.on("error", (e: NodeJS.ErrnoException) => { clearTimeout(t); resolve({ ok: false, error: e.message, enoent: e.code === "ENOENT" }); });
      p.on("close", (c) => { clearTimeout(t); resolve(c === 0 ? { ok: true, version: out.trim() } : { ok: false, error: `종료 코드 ${c}` }); });
    });
    if (r.ok || !r.enoent) return r;
  }
  return { ok: false, error: "claude 프로그램이 설치되어 있지 않습니다" };
}
