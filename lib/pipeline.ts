import { config, hasCloudflare } from "@/config";
import { getDb } from "@/lib/db";
import { jobLog, setJobStage } from "@/lib/log";
import { getSettings } from "@/lib/settings";
import { newContext } from "@/lib/playwright";
import { scrapeTrends } from "@/lib/scrape/trends";
import { findImageForSlot } from "@/lib/scrape/images";
import { generateDraft, generateIdeas, generateModeDraft, sanitizeDraft } from "@/lib/ai/content";
import { generateForSlot } from "@/lib/ai/imagegen";
import { describePhotos, listLocalPhotos, placePhotos } from "@/lib/localPhotos";
import { verifySession } from "@/lib/naver/session";
import { checkPublishGuards, publishToNaver, type PublishResult } from "@/lib/naver/publish";
import type { Draft, ImageStyle, JobInput, PhotoSource, Source } from "@/lib/types";

type Level = "info" | "warn" | "error" | "ok";

/** 진행 중인 잡이 있는지 (중복 실행 방지 — 7-16) */
export function activeJob(): { id: number } | undefined {
  return getDb().prepare("SELECT id FROM jobs WHERE status IN ('pending','scraping','writing','imaging','publishing') ORDER BY id DESC LIMIT 1").get() as { id: number } | undefined;
}

export function createJob(input: JobInput): number {
  const r = getDb().prepare("INSERT INTO jobs (keyword, status, stage, auto, mode, inputs) VALUES (?, 'pending', '대기', ?, ?, ?)")
    .run(input.keyword, input.mode === "auto" ? 1 : 0, input.mode, JSON.stringify(input));
  return Number(r.lastInsertRowid);
}

/** ⚠️ photoDescs 는 인자로 받는다. 내부에서 다시 만들면 claude 호출이 배로 든다(6-8, 6-10) */
export async function fillImages(jobId: number, draftId: number, draft: Draft, opts: {
  photoSource: PhotoSource; imageStyle: ImageStyle; photos: string[]; photoDescs: string[]; placement: "order" | "ai";
}): Promise<Record<number, string>> {
  const log = (m: string, l: Level = "info") => jobLog(jobId, m, l);
  const slots = draft.sections.map((s, i) => ({ s, i })).filter((x) => x.s.type === "image") as Array<{ s: Extract<Draft["sections"][number], { type: "image" }>; i: number }>;
  const out: Record<number, string> = {};
  if (!slots.length || opts.photoSource === "none") return out;
  const db = getDb();
  const settings = getSettings();

  if (opts.photoSource === "local") {
    // 직접 찍은 사진 → 워터마크·초상권 필터를 적용하지 않는다
    const placed = await placePhotos(slots.map((x) => x.s.caption || x.s.query), opts.photos, opts.photoDescs, opts.placement);
    slots.forEach((x, k) => {
      if (!placed[k]) return;
      out[x.i] = placed[k];
      db.prepare("INSERT INTO images (job_id, draft_id, query, local_path, source_site, verdict_ok, verdict_reason, section_index) VALUES (?,?,?,?,?,1,?,?)")
        .run(jobId, draftId, x.s.query, placed[k], "local", "내 사진", x.i);
    });
    log(`내 사진 ${Object.keys(out).length}장을 배치했습니다`, "ok");
    return out;
  }

  if (opts.photoSource === "ai") {
    if (!hasCloudflare()) { log("AI 사진 생성 열쇠가 없어 사진 없이 진행합니다", "warn"); return out; }
    for (let k = 0; k < slots.length; k++) {
      const { s, i } = slots[k];
      const ctx = draft.sections.slice(Math.max(0, i - 3), i + 4)
        .filter((x) => x.type === "paragraph").slice(0, 2).map((x) => (x as { text: string }).text).join(" ");
      log(`사진 ${k + 1}/${slots.length} 그리는 중…`);
      const r = await generateForSlot({ jobId, title: draft.title, scene: s.query + (s.caption ? ` (${s.caption})` : ""), context: ctx, style: opts.imageStyle, steps: settings.cfImageSteps, index: i, log });
      if (r) {
        out[i] = r.path;
        db.prepare("INSERT INTO images (job_id, draft_id, query, local_path, source_site, verdict_ok, verdict_reason, section_index, gen_prompt) VALUES (?,?,?,?,?,1,?,?,?)")
          .run(jobId, draftId, s.query, r.path, "ai", "생성 통과", i, r.prompt);
      }
    }
    log(`AI 사진 ${Object.keys(out).length}/${slots.length}장 확보`, Object.keys(out).length ? "ok" : "warn");
    return out;
  }

  // crawl
  const { browser, context } = await newContext({ headless: !settings.showBrowser });
  try {
    for (let k = 0; k < slots.length; k++) {
      const { s, i } = slots[k];
      log(`사진 ${k + 1}/${slots.length} 찾는 중: ${s.query}`);
      const file = await findImageForSlot(context, { jobId, draftId, query: s.query, topic: draft.title, index: i, max: settings.imageCandidates, log });
      if (file) out[i] = file;
    }
  } finally {
    await browser.close().catch(() => {});
  }
  const rejected = (db.prepare("SELECT COUNT(*) AS n FROM images WHERE job_id=? AND verdict_ok=0").get(jobId) as { n: number }).n;
  log(`사진 ${Object.keys(out).length}/${slots.length}장 채택 (탈락 ${rejected}장 — 사유는 결과 화면에)`, Object.keys(out).length ? "ok" : "warn");
  return out;
}

function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: () => T): Promise<T> {
  return Promise.race([p, new Promise<T>((r) => setTimeout(() => r(onTimeout()), ms))]);
}

/** fire-and-forget. API 에서 await 하지 말 것 */
export async function runJob(jobId: number, overrides?: { entryUrl?: string; skipPublish?: boolean }): Promise<void> {
  const db = getDb();
  const job = db.prepare("SELECT * FROM jobs WHERE id=?").get(jobId) as { inputs: string } | undefined;
  if (!job) return;
  const input = JSON.parse(job.inputs) as JobInput;
  const log = (m: string, l: Level = "info") => jobLog(jobId, m, l);
  const settings = getSettings();
  try {
    let draft: Draft;
    let ideaId: number | null = null;
    let photos: string[] = [];
    let photoDescs: string[] = [];

    if (input.mode === "auto") {
      setJobStage(jobId, "scraping", "자료 모으는 중");
      log(`"${input.keyword}" 관련 뉴스·블로그를 모읍니다`);
      let sources: Source[] = [];
      try { sources = await scrapeTrends(input.keyword, settings.scrapeTopN, !settings.showBrowser); }
      catch (e) { log("자료 모으기 실패: " + (e as Error).message.slice(0, 120), "warn"); }
      const ins = db.prepare("INSERT INTO sources (job_id, type, title, summary, url) VALUES (?,?,?,?,?)");
      sources.forEach((s) => ins.run(jobId, s.type, s.title, s.summary, s.url));
      log(`자료 ${sources.length}건 (뉴스 ${sources.filter((s) => s.type === "news").length} · 블로그 ${sources.filter((s) => s.type === "blog").length})`, sources.length ? "ok" : "warn");

      setJobStage(jobId, "writing", "글감 고르는 중");
      const ideas = await generateIdeas(input.keyword, sources, 5);
      if (!ideas.ok) throw new Error("글감 만들기 실패: " + ideas.error);
      const insI = db.prepare("INSERT INTO ideas (job_id, title, angle, rationale, chosen) VALUES (?,?,?,?,?)");
      ideas.data.forEach((d, k) => { const r = insI.run(jobId, d.title, d.angle, d.rationale, k === 0 ? 1 : 0); if (k === 0) ideaId = Number(r.lastInsertRowid); });
      log(`글감 ${ideas.data.length}개 중 1등: ${ideas.data[0].title}`, "ok");

      setJobStage(jobId, "writing", "본문 쓰는 중");
      const d = await generateDraft(input.keyword, ideas.data[0], sources, input.photoSource);
      if (!d.ok) throw new Error("본문 쓰기 실패: " + d.error);
      draft = d.data;
    } else {
      if (input.photoSource === "local") {
        setJobStage(jobId, "writing", "내 사진 살펴보는 중");
        photos = listLocalPhotos(input.photoDir);
        if (!photos.length) throw new Error("사진 폴더에 사진이 없습니다");
        log(`내 사진 ${photos.length}장`);
        // 사진 설명은 본문 생성 "전에 한 번만" → 프롬프트와 배치에 재사용
        photoDescs = input.placement === "ai" || photos.length <= 12 ? await describePhotos(photos) : photos.map((p) => p.split(/[\\/]/).pop()!);
      }
      setJobStage(jobId, "writing", "본문 쓰는 중");
      const d = await generateModeDraft(input.mode, input.keyword, input.details, input.photoSource, photos.length, photoDescs);
      if (!d.ok) throw new Error("본문 쓰기 실패: " + d.error);
      draft = d.data;
    }

    const { draft: clean, droppedHighlights } = sanitizeDraft(draft);
    if (droppedHighlights) log(`본문에 없는 강조 구절 ${droppedHighlights}개를 뺐습니다`, "warn");
    const dr = db.prepare("INSERT INTO drafts (job_id, idea_id, title, body_json) VALUES (?,?,?,?)").run(jobId, ideaId, clean.title, JSON.stringify(clean.sections));
    const draftId = Number(dr.lastInsertRowid);
    log(`글 완성: ${clean.title} (블록 ${clean.sections.length}개)`, "ok");

    setJobStage(jobId, "imaging", "사진 준비 중");
    const images = await fillImages(jobId, draftId, clean, { photoSource: input.photoSource, imageStyle: input.imageStyle, photos, photoDescs, placement: input.placement });

    if (overrides?.skipPublish) { setJobStage(jobId, "done", "완료(발행 단계 생략)"); return; }

    setJobStage(jobId, "publishing", "블로그에 입력 중");
    const s = getSettings(); // 발행 직전 최신 설정
    const r = await (async (): Promise<PublishResult> => {
      if (!s.dryRun) {
        const g = checkPublishGuards(s);
        if (!g.ok) return { status: "blocked", note: g.reason };
      }
      let blogId: string | undefined;
      if (!overrides?.entryUrl) {
        const sess = await verifySession();
        if (!sess.valid) return { status: "failed", note: `네이버 로그인이 필요합니다(${sess.reason ?? "만료"})` };
        blogId = sess.blogId;
      }
      log(s.dryRun ? "연습 모드: 글쓰기 화면에 입력만 하고 발행하지 않습니다" : "실제 발행을 진행합니다", s.dryRun ? "info" : "warn");
      return withTimeout(
        publishToNaver({ jobId, title: clean.title, sections: clean.sections, images, headingAsQuote: input.mode !== "auto", dryRun: s.dryRun, visibility: s.visibility, headless: !s.showBrowser, log, entryUrl: overrides?.entryUrl, blogId }),
        config.publishStageTimeoutMs,
        () => ({ status: "failed", note: "글쓰기 화면이 15분 넘게 응답하지 않아 중단했습니다" }),
      );
    })();
    db.prepare("INSERT INTO posts (job_id, draft_id, status, blog_url, screenshot, note, published_at) VALUES (?,?,?,?,?,?, CASE WHEN ?='published' THEN datetime('now') ELSE NULL END)")
      .run(jobId, draftId, r.status, r.url ?? null, r.screenshot ?? null, r.note, r.status);
    log(r.note, r.status === "published" || r.status === "dry_run" ? "ok" : r.status === "blocked" ? "warn" : "error");
    if (r.status === "failed") setJobStage(jobId, "failed", "발행 실패", r.note);
    else setJobStage(jobId, "done", r.status === "published" ? "발행 완료" : r.status === "dry_run" ? "연습 완료" : "발행 막힘");
  } catch (e) {
    const msg = (e as Error).message;
    log(msg, "error");
    setJobStage(jobId, "failed", "실패", msg);
  }
}
