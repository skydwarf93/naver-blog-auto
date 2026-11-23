import path from "node:path";
import type { Frame, Locator, Page } from "playwright";
import { naverContext, newContext } from "@/lib/playwright";
import { getDb } from "@/lib/db";
import { paths } from "@/lib/paths";
import { EDITOR, NAVER } from "@/lib/scrape/selectors";
import { neutralizeMarkdown } from "@/lib/ai/content";
import type { Settings, Visibility } from "@/lib/settings";
import type { Section } from "@/lib/types";

// ★ 에디터 자동화. 7장 함정 목록의 순서·셀렉터를 그대로 따른다. "정리"하지 말 것.

export interface PublishInput {
  jobId: number;
  title: string;
  sections: Section[];
  /** section index → 로컬 이미지 경로 (없으면 그 자리는 건너뜀) */
  images: Record<number, string>;
  headingAsQuote: boolean;
  dryRun: boolean;
  /** true 면 입력 후 "임시저장" 만 누르고 끝낸다. 발행 버튼은 절대 누르지 않는다 */
  saveDraftOnly?: boolean;
  visibility: Visibility;
  headless: boolean;
  log: (m: string, l?: "info" | "warn" | "error" | "ok") => void;
  /** 테스트 전용: 로컬 하네스 주소. 지정하면 네이버 세션 없이 이 주소로 진입한다 */
  entryUrl?: string;
  blogId?: string;
  /** 테스트 전용: 브라우저를 닫기 직전에 화면 상태를 검사한다 */
  inspect?: (page: Page) => Promise<void>;
  /** 임시저장 성공 후 창을 닫지 않고 사용자가 닫을 때까지 둔다(사용자 요청). 최대 대기 ms (기본 2시간) */
  keepOpenAfterSave?: boolean;
  keepOpenMaxMs?: number;
}
export interface PublishResult {
  status: "published" | "dry_run" | "draft_saved" | "failed" | "blocked";
  url?: string;
  screenshot?: string;
  note: string;
  stats?: Record<string, number>;
}

const VISIBILITY_LABEL: Record<Visibility, string> = { public: "전체공개", neighbor: "이웃공개", both: "서로이웃공개", private: "비공개" };

/** 발행 가드 — 연습 모드가 아닐 때만 */
export function checkPublishGuards(s: Settings): { ok: true } | { ok: false; reason: string } {
  if (s.killSwitch) return { ok: false, reason: "전체 중단이 켜져 있어 발행하지 않았습니다" };
  const db = getDb();
  // ⚠️ 7-22: datetime('now') 는 UTC. "오늘" 은 로컬 날짜 → 양쪽 다 localtime
  const today = (db.prepare("SELECT COUNT(*) AS n FROM posts WHERE status='published' AND date(published_at,'localtime') = date('now','localtime')").get() as { n: number }).n;
  if (today >= s.dailyPublishLimit) return { ok: false, reason: `오늘 발행 한도(${s.dailyPublishLimit}편)에 도달했습니다` };
  const last = db.prepare("SELECT published_at FROM posts WHERE status='published' AND published_at IS NOT NULL ORDER BY published_at DESC LIMIT 1").get() as { published_at: string } | undefined;
  if (last && s.minPublishIntervalMin > 0) {
    const elapsedMin = (Date.now() - new Date(last.published_at.replace(" ", "T") + "Z").getTime()) / 60000;
    if (elapsedMin < s.minPublishIntervalMin) {
      return { ok: false, reason: `마지막 발행 후 ${Math.floor(elapsedMin)}분 지났습니다(최소 ${s.minPublishIntervalMin}분 간격)` };
    }
  }
  return { ok: true };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- 공용 헬퍼 ----------

async function firstVisible(scope: Frame | Page, sels: string[]): Promise<Locator | null> {
  for (const s of sels) {
    const loc = scope.locator(s).first();
    try {
      if ((await loc.count()) > 0 && (await loc.isVisible())) return loc;
    } catch { /* 다음 후보 */ }
  }
  return null;
}

/** ⚠️ 발행 버튼·공개 범위 라디오는 환경에 따라 iframe 안/밖 어디든 있을 수 있다 → 양쪽 다 뒤진다 (필수) */
async function clickAnywhere(page: Page, frame: Frame, sels: string[]): Promise<boolean> {
  for (const scope of [frame, page] as const) {
    const el = await firstVisible(scope, sels);
    if (el) { await el.click({ timeout: 5000 }); return true; }
  }
  return false;
}

// ⚠️ 7-25: VS16(U+FE0F) 이 붙은 이모지는 keyboard.type 으로 base 문자가 하나 더 남는다(⚠️ → ⚠⚠️).
//    insertText 로 "문단 전체" 를 넣으면 이모지 하나만 남고 글이 사라진다(실측) → VS16 클러스터 조각만 insertText.
const HAS_VS16 = /️/;
const VS16_CLUSTER = /([\s\S]️⃣?)/;
async function typeText(page: Page, raw: string) {
  const text = neutralizeMarkdown(raw);
  for (const part of text.split(VS16_CLUSTER)) {
    if (!part) continue;
    if (HAS_VS16.test(part)) await page.keyboard.insertText(part);
    else await page.keyboard.type(part, { delay: 7 });
  }
}

export class EditorError extends Error {}

class Editor {
  stats: Record<string, number> = { quoteSplit: 0, exits: 0, captionsOk: 0, captionsSkipped: 0, imagesOk: 0, imagesFailed: 0, highlights: 0, highlightsSkipped: 0 };
  pendingUpload = { path: null as string | null, done: false };
  constructor(public page: Page, public frame: Frame, public log: PublishInput["log"]) {}

  async focusInfo() {
    return this.frame.evaluate(() => {
      const sel = window.getSelection();
      const node = sel?.anchorNode ?? document.activeElement;
      const el = (node && (node.nodeType === 1 ? node : node.parentElement)) as HTMLElement | null;
      return {
        inTitle: Boolean(el?.closest(".se-documentTitle, .se-section-documentTitle")),
        inComponent: Boolean(el?.closest(".se-component")),
        inQuote: Boolean(el?.closest(".se-quotation, .se-component.se-quotation")),
        inCaption: Boolean(el?.closest(".se-caption")),
        inBottomBar: Boolean(document.activeElement?.closest(".se-flayer-unified-toolbar-wrapper")),
        editable: Boolean((document.activeElement as HTMLElement | null)?.isContentEditable),
      };
    });
  }

  /** 도움말 패널 + 우측 도크 닫기. ⚠️ 7-4, 7-21: se-help-* 와 se-sidebar-* 둘 다, 없으면 Escape */
  async closeOverlays() {
    let closed = 0;
    for (const scope of [this.frame, this.page] as const) {
      for (const sel of [...EDITOR.helpClose, ...EDITOR.sidebarClose]) {
        const loc = scope.locator(sel);
        const n = await loc.count().catch(() => 0);
        for (let i = 0; i < n; i++) {
          const el = loc.nth(i);
          if (await el.isVisible().catch(() => false)) {
            await el.click({ timeout: 3000 }).then(() => closed++).catch(() => {});
            await sleep(300);
          }
        }
      }
    }
    const stillOpen = await firstVisible(this.frame, [...EDITOR.helpPanel, ...EDITOR.sidebar]);
    if (stillOpen) { await this.page.keyboard.press("Escape"); await sleep(300); }
    return closed;
  }

  /** ⚠️ 7-3: 복원 팝업('작성 중인 글이 있습니다') + 차단막. '취소' 로 닫아 새 글을 시작한다 */
  async handleRestorePopup(): Promise<boolean> {
    const popup = await firstVisible(this.frame, EDITOR.restorePopup);
    if (!popup) return true;
    this.log("이전에 쓰다 만 글 안내창을 닫습니다");
    // ⚠️ 7-1: :has-text('취소') 금지(취소선 버튼에 부분일치). 클래스 → 팝업 스코프 :text-is 정확일치
    const cancel = await firstVisible(this.frame, EDITOR.restoreCancel);
    if (cancel) await cancel.click({ timeout: 5000 });
    await sleep(800);
    const still = await firstVisible(this.frame, EDITOR.restorePopup);
    const dim = await firstVisible(this.frame, EDITOR.popupDim);
    return !still && !dim;
  }

  async clickTool(sels: string[], what: string) {
    const el = await firstVisible(this.frame, sels);
    if (!el) throw new EditorError(`도구 버튼을 찾지 못했습니다: ${what}`);
    await el.click({ timeout: 5000 });
    await sleep(350); // 드롭다운 애니메이션
  }

  async setFormat(kind: "heading" | "body" | "quote") {
    await this.clickTool(EDITOR.textFormatOpen, "문단 서식");
    await this.clickTool(kind === "heading" ? EDITOR.optHeading : kind === "body" ? EDITOR.optBody : EDITOR.optQuote, `서식-${kind}`);
  }

  /**
   * ⚠️ 7-5: 인용구·구분선·캡션 같은 컴포넌트 안에서는 어떤 키로도 탈출되지 않는다(ArrowDown/Enter×2/Escape/Ctrl+End 전부 실패).
   *    '본문' 서식을 적용하면 인용구가 통째로 평범한 텍스트로 환원된다. 유일한 해결 = 마지막 컴포넌트 아래 빈 영역 마우스 클릭.
   * ⚠️ 7-6: y 를 아무렇게나 잡으면 하단 글감 검색바를 눌러 이후 글자가 검색창으로 샌다 → 실측 위치로 클램프.
   * ⚠️ 7-27: boundingBox 는 요소가 없으면 30초 기다린다 → timeout 800.
   */
  /** 마지막 블록 정보(개수·클래스·글자). 탈출 성공 판정은 포커스가 아니라 "새 블록이 실제로 생겼나" 로 한다 */
  async lastInfo() {
    return this.frame.evaluate((sel) => {
      const c = [...document.querySelectorAll(sel)];
      const l = c[c.length - 1];
      return { n: c.length, cls: String(l?.className ?? ""), text: (l?.textContent ?? "").trim().slice(0, 30) };
    }, EDITOR.contentComponents);
  }

  /** 마지막 '글' 블록의 마지막 문단을 직접 클릭해 커서를 넣는다(요소 클릭 — 본문 진입 때 검증된 방식) */
  async placeCaretInLastText(): Promise<boolean> {
    const comp = this.frame.locator(".se-content .se-component.se-text").last();
    if ((await comp.count()) === 0) return false;
    const para = comp.locator(".se-text-paragraph").last();
    const target = (await para.count()) ? para : comp;
    await target.scrollIntoViewIfNeeded().catch(() => {});
    await target.click({ timeout: 3000 }).catch(() => {});
    await sleep(300);
    await this.page.keyboard.press("End");
    const f = await this.focusInfo();
    return !f.inQuote && !f.inCaption && !f.inTitle && !f.inBottomBar;
  }

  /**
   * ⚠️ 7-5 컴포넌트 탈출. 실측(윈도우, 2026-11): 마지막 블록 아래 빈칸 클릭은 DIV.se-canvas-bottom.se-is-clickable-canvas-bottom-button
   *    에 맞았지만 6번 눌러도 블록 수가 늘지 않았다(블록끝 581 고정). 포커스도 어느 블록에도 없었다.
   *    → 성공 판정을 "새 글 블록이 실제로 생겼는가(개수 증가)" 로 바꾸고, 여러 방법을 차례로 시도한다.
   */
  async exitToNewParagraph() {
    this.stats.exits++;
    const before = await this.lastInfo();
    const isText = (cls: string) => /\bse-text\b/.test(cls) && !/quotation/.test(cls);
    // 이미 마지막이 빈 글 블록이면(사진 올린 뒤 네이버가 자동으로 만든 경우 등) 그리로 들어가면 끝
    if (isText(before.cls) && !before.text && (await this.placeCaretInLastText())) return;
    const diag: string[] = [`시작 블록 ${before.n}개 last=${before.cls.split(" ").slice(0, 3).join(".")}`];
    const created = async (label: string) => {
      await sleep(600);
      const a = await this.lastInfo();
      const ok = a.n > before.n && isText(a.cls);
      diag.push(`${label}: ${before.n}→${a.n} last=${a.cls.split(" ").slice(0, 3).join(".")}`);
      return ok && (await this.placeCaretInLastText());
    };
    // ① 네이버의 '하단 빈칸' 요소를 요소 클릭(가운데)
    const cb = this.frame.locator(EDITOR.canvasBottom.join(", ")).last();
    if ((await cb.count()) > 0) {
      await cb.scrollIntoViewIfNeeded().catch(() => {});
      await cb.click({ timeout: 3000 }).catch((e) => diag.push("①오류 " + String(e).slice(0, 60)));
      if (await created("①하단빈칸 클릭")) return;
      // ② 마우스 이벤트를 직접 보낸다
      for (const ev of ["mousedown", "mouseup", "click"]) await cb.dispatchEvent(ev).catch(() => {});
      if (await created("②이벤트 직접")) return;
    }
    // ③ 좌표 클릭(예전 방식) — 블록 아래 여러 높이
    const vh = this.page.viewportSize()?.height ?? 900;
    for (const off of [30, 80, 140]) {
      const last = this.frame.locator(EDITOR.contentComponents).last();
      await last.scrollIntoViewIfNeeded().catch(() => {});
      const lbox = await last.boundingBox({ timeout: 800 }).catch(() => null);
      if (!lbox) break;
      const rawBar = await this.frame.locator(EDITOR.bottomToolbar).first().boundingBox({ timeout: 800 }).catch(() => null);
      const barBox = rawBar && rawBar.height > 0 && rawBar.y > vh * 0.5 ? rawBar : null;
      const maxY = Math.min(barBox ? barBox.y - 20 : vh - 150, vh - 20);
      const y = Math.max(140, Math.min(lbox.y + lbox.height + off, maxY));
      await this.page.mouse.click(lbox.x + lbox.width / 2, y);
      if (await created(`③좌표 +${off}(y=${Math.round(y)})`)) return;
      const f = await this.focusInfo();
      if (f.inBottomBar) throw new EditorError("커서가 하단 글감 검색창으로 들어갔습니다");
      if (f.inComponent && !f.inQuote && !f.inCaption && !f.inTitle) return; // 하네스 등 포커스로 확인되는 환경
    }
    this.log("탈출 진단: " + diag.join(" | "), "warn");
    throw new EditorError("블록 밖으로 커서를 빼내지 못했습니다 — 진단: " + diag.join(" | "));
  }

  /** 컴포넌트(구분선·사진)를 넣기 전: 아래 줄에 자리표시 "." 를 만들고 커서를 그 위 빈 줄로 옮긴다 */
  async prepPlaceholder() {
    await this.page.keyboard.press("Enter");
    await this.page.keyboard.type(".");
    await this.page.keyboard.press("ArrowUp");
    await this.page.keyboard.press("Home");
    await sleep(150);
  }

  /** 컴포넌트를 넣은 뒤: 아래에 남은 "." 글 블록으로 들어가 지운다. 없으면 일반 탈출 */
  async consumePlaceholder() {
    const li = await this.lastInfo();
    if (/\bse-text\b/.test(li.cls) && !/quotation/.test(li.cls) && li.text === "." && (await this.placeCaretInLastText())) {
      await this.page.keyboard.press("End");
      await this.page.keyboard.press("Backspace");
      this.stats.placeholderOk = (this.stats.placeholderOk ?? 0) + 1;
      return;
    }
    await this.exitToNewParagraph();
    // 자리표시가 어딘가 남았으면 마지막에 정리할 수 있도록 기록
    this.stats.placeholderMissed = (this.stats.placeholderMissed ?? 0) + 1;
  }

  async writeHeading(text: string) {
    await this.setFormat("heading");
    await typeText(this.page, text);
    await this.page.keyboard.press("Enter");
    await sleep(200);
    await this.setFormat("body");
  }

  async writeQuote(text: string) {
    // 툴바 인용구 '삽입' 대신: 텍스트 먼저 → 선택 → 문단서식 인용구 (훨씬 안정적)
    // ⚠️ 실측: 인용구 아래 빈칸 클릭으로는 새 문단이 안 생겼다. → 인용구로 바꾸기 "전에" 아래 줄에 자리표시 "." 를 만들어 두고,
    //    윗줄만 인용구로 바꾼다. 아래 줄은 인용구 밖 글 블록으로 남으므로 그걸 클릭해 들어가 "." 를 지운다.
    await typeText(this.page, text);
    await this.page.keyboard.press("Enter");
    await this.page.keyboard.type(".");
    await this.page.keyboard.press("ArrowUp");
    await this.page.keyboard.press("End");
    await this.page.keyboard.press("Shift+Home");
    await sleep(150);
    await this.setFormat("quote");
    await sleep(500);
    const li = await this.lastInfo();
    if (/\bse-text\b/.test(li.cls) && !/quotation/.test(li.cls) && li.text === ".") {
      if (await this.placeCaretInLastText()) {
        await this.page.keyboard.press("End");
        await this.page.keyboard.press("Backspace");
        this.stats.quoteSplit = (this.stats.quoteSplit ?? 0) + 1;
        return;
      }
    }
    // 분리가 안 됐다: 자리표시가 인용구 안에 들어갔으면 지운 뒤 일반 탈출
    if (/quotation/.test(li.cls) && /\.$/.test(li.text)) {
      this.log("인용구 분리 방식이 통하지 않아 다른 방법으로 빠져나옵니다", "warn");
      await this.page.keyboard.press("Control+End");
      await this.page.keyboard.press("Backspace");
      await this.page.keyboard.press("Backspace");
    }
    await this.exitToNewParagraph();
  }

  async writeParagraph(text: string, highlight?: string | null) {
    const t = neutralizeMarkdown(text);
    const hl = highlight ? neutralizeMarkdown(highlight) : "";
    const at = hl ? t.indexOf(hl) : -1; // 이중 방어: 타이핑 직전에도 다시 확인
    if (hl && at < 0) this.stats.highlightsSkipped++;
    if (at >= 0) {
      // 인라인 서식은 "클릭 이후 새로 입력되는 글자" 에 적용된다(실측). 선택 후 적용이 아니다
      await typeText(this.page, t.slice(0, at));
      await this.clickTool(EDITOR.bgColorOpen, "배경색");
      await this.clickTool(EDITOR.bgColorYellow, "노랑");
      await this.clickTool(EDITOR.bold, "굵게");
      await typeText(this.page, hl);
      await this.clickTool(EDITOR.bgColorOpen, "배경색");
      await this.clickTool(EDITOR.bgColorNone, "색 없음");
      await this.clickTool(EDITOR.bold, "굵게");
      await typeText(this.page, t.slice(at + hl.length));
      this.stats.highlights++;
    } else {
      await typeText(this.page, t);
    }
    await this.page.keyboard.press("Enter");
    await this.page.keyboard.press("Enter");
  }

  async writeDivider() {
    await this.prepPlaceholder();
    await this.clickTool(EDITOR.dividerInsert, "구분선");
    await sleep(500);
    await this.consumePlaceholder();
  }

  /** ⚠️ 7-7, 7-18 — 영구 filechooser 핸들러 + 이미지 컴포넌트 클릭으로 캡션 펼치기(se-is-on) */
  async writeImage(file: string, caption?: string | null) {
    await this.prepPlaceholder();
    this.pendingUpload.path = file;
    this.pendingUpload.done = false;
    await this.clickTool(EDITOR.imageButton, "사진");
    const deadline = Date.now() + 20000;
    while (!this.pendingUpload.done && Date.now() < deadline) await sleep(200);
    this.pendingUpload.path = null;
    if (!this.pendingUpload.done) { this.stats.imagesFailed++; this.log(`사진 올리기가 20초 안에 끝나지 않았습니다: ${path.basename(file)}`, "warn"); await this.consumePlaceholder(); return; }
    await sleep(2600);
    this.stats.imagesOk++;

    const comp = this.frame.locator(EDITOR.imageComponent).last();
    if (caption && (await comp.count()) > 0) {
      await comp.click({ timeout: 5000 }).catch(() => {});
      await sleep(500);
      const cap = comp.locator(EDITOR.caption).first();
      // 크기 숫자(640×24 / 64×63)가 아니라 se-is-on 클래스가 "펼쳐짐" 의 안정적인 신호
      let on = false;
      for (let i = 0; i < 10 && !on; i++) {
        on = /\bse-is-on\b/.test((await cap.getAttribute("class").catch(() => "")) || "");
        if (!on) await sleep(200);
      }
      if (on) {
        await cap.click({ timeout: 3000 }); // el.focus() 는 activeElement 가 안 바뀌어 글자가 사라진다 — 쓰지 말 것
        await typeText(this.page, caption);
        this.stats.captionsOk++;
      } else {
        // 본문에 그냥 치면 사진 설명이 아니라 본문 줄이 되고 다음 문단과 합쳐진다 → 빼는 게 낫다
        this.stats.captionsSkipped++;
        this.log("사진 설명 칸이 열리지 않아 이 사진의 설명은 생략합니다", "warn");
      }
    }
    await this.consumePlaceholder();
  }

  async strikeActive(): Promise<boolean> {
    const s = await firstVisible(this.frame, EDITOR.strike);
    if (!s) return false;
    const cls = (await s.getAttribute("class")) || "";
    return /se-is-selected|se-is-on|active/.test(cls);
  }

  /** ⚠️ 7-20: iframe 은 뷰포트 높이를 따라간다 → fullPage 만으로는 마지막 한 화면뿐. scrollHeight 만큼 키워서 찍는다 */
  async screenshotFull(file: string): Promise<{ file: string; partial: boolean }> {
    const orig = this.page.viewportSize() ?? { width: 1366, height: 900 };
    const content = this.frame.locator(EDITOR.content).first();
    const sh = await content.evaluate((el) => el.scrollHeight).catch(() => 0); // boundingBox().height 금지 (761 vs 3637)
    const box = await content.boundingBox({ timeout: 800 }).catch(() => null);
    if (!sh || !box) {
      await this.page.screenshot({ path: file, fullPage: true });
      this.log("완성 화면 사진이 일부만 담겼을 수 있습니다", "warn");
      return { file, partial: true };
    }
    const target = Math.min(9000, Math.ceil(box.y + sh + 160));
    try {
      if (target > orig.height) await this.page.setViewportSize({ width: orig.width, height: target });
      await sleep(1200);
      const docScroll = await this.frame.evaluate(() => ({ s: document.documentElement.scrollHeight, c: document.documentElement.clientHeight }));
      await this.page.screenshot({ path: file, fullPage: true });
      const partial = target >= 9000 || docScroll.s > docScroll.c + 40;
      if (partial) this.log("글이 길어 완성 화면 사진에 끝부분이 덜 담겼을 수 있습니다", "warn");
      return { file, partial };
    } finally {
      await this.page.setViewportSize(orig);
    }
  }
}

/**
 * 임시저장. ⚠️ 이 셀렉터들은 아직 살아 있는 에디터에서 실측하지 못했다(로그인 전 작성).
 *   :has-text('저장') 금지 — '임시저장 글 N개' 같은 다른 버튼에 부분일치한다(7-1, 7-2 와 같은 함정). :text-is 정확일치만.
 *   저장됐는지는 버튼 클릭이 아니라 화면의 저장 알림/임시저장 개수 변화로 확인한다(7-11 과 같은 원칙).
 */
async function saveDraft(page: Page, frame: Frame, log: PublishInput["log"]): Promise<{ ok: boolean; how: string }> {
  const countSaved = async () => {
    for (const scope of [page, frame] as const) {
      const t = await scope.evaluate(() => document.body?.innerText ?? "").catch(() => "");
      // 실측: 상단 버튼은 "저장 0" 형태
      const m = t.match(/(?:임시\s?)?저장\s*\n?\s*(\d+)/);
      if (m) return Number(m[1]);
    }
    return null;
  };
  const before = await countSaved();
  const clicked = await clickAnywhere(page, frame, EDITOR.saveDraft);
  if (!clicked) {
    // 저장 버튼을 못 찾으면 네이버 단축키(Ctrl/⌘+S)로 시도
    await page.keyboard.press(process.platform === "darwin" ? "Meta+s" : "Control+s");
    log("저장 버튼을 찾지 못해 단축키로 저장을 시도했습니다", "warn");
  }
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    for (const scope of [page, frame] as const) {
      const t = await scope.evaluate(() => document.body?.innerText ?? "").catch(() => "");
      if (/저장되었습니다|임시\s?저장\s?(되었|완료|했)/.test(t)) return { ok: true, how: "저장 알림을 확인했습니다." };
    }
    const after = await countSaved();
    if (before !== null && after !== null && after > before) return { ok: true, how: `임시저장 글 수가 ${before}→${after}개로 늘었습니다.` };
    await sleep(400);
  }
  return { ok: false, how: clicked ? "저장 버튼은 눌렀지만 저장 알림이 보이지 않았습니다" : "저장 버튼을 찾지 못했습니다" };
}

async function getEditorFrame(page: Page): Promise<Frame> {
  const handle = await page.waitForSelector(EDITOR.frame, { timeout: 20000 }).catch(() => null);
  const f = handle ? await handle.contentFrame() : null;
  return f ?? page.mainFrame();
}

export async function publishToNaver(input: PublishInput): Promise<PublishResult> {
  const { log } = input;
  if (!input.entryUrl && !input.blogId) return { status: "failed", note: "블로그 주소를 알 수 없습니다(네이버 로그인 필요)" };
  // 실제 네이버는 같은 브라우저 기록(프로필)으로, 하네스는 빈 브라우저로
  const { browser, context } = input.entryUrl ? await newContext({ headless: input.headless }) : await naverContext(input.headless);
  const shot = path.join(paths.screenshots, `job${input.jobId}-${Date.now()}.png`);
  let pageRef: Page | null = null;
  let keepOpen = false;
  try {
    const page = await context.newPage();
    pageRef = page;
    page.setDefaultTimeout(10000); // ⚠️ 7-27: 기본 30초 대기가 누적되지 않게

    // 1. ⚠️ 7-7: 페이지를 열기 "전에" 영구 filechooser 핸들러. 일회성 리스너가 만료되면
    //    OS 네이티브 파일 창이 떠서 브라우저가 영구히 멈춘다(CPU 0%, 에러 없음). 플랫폼 무관.
    let editor: Editor | null = null;
    page.on("filechooser", async (c) => {
      const pu = editor?.pendingUpload;
      try { if (pu?.path) await c.setFiles(pu.path); }
      catch (e) { log("사진 파일 지정 실패: " + (e as Error).message, "warn"); }
      finally { if (pu) pu.done = true; }
    });

    // 2. 진입
    const url = input.entryUrl ?? NAVER.writeUrl(input.blogId!);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await sleep(2500);
    if (/nid\.naver\.com/.test(page.url())) return { status: "failed", note: "네이버 로그인이 풀려 글쓰기 화면에 들어가지 못했습니다" };
    const frame = await getEditorFrame(page);
    editor = new Editor(page, frame, log);
    const ed = editor;
    await frame.waitForSelector(EDITOR.title.join(", "), { timeout: 20000 }).catch(() => {});

    // 3. 복원 팝업
    if (!(await ed.handleRestorePopup())) {
      await page.screenshot({ path: shot });
      return { status: "failed", screenshot: shot, note: "'작성 중인 글' 안내창을 닫지 못해 중단했습니다" };
    }
    // 4. 도움말/온보딩
    await ed.closeOverlays();

    // 5. 제목 → 본문
    const title = await firstVisible(frame, EDITOR.title);
    if (!title) { await page.screenshot({ path: shot }); return { status: "failed", screenshot: shot, note: "제목 칸을 찾지 못했습니다" }; }
    await title.click();
    await typeText(page, input.title);
    let body = await firstVisible(frame, EDITOR.body);
    if (body) await body.click();
    else await page.keyboard.press("Enter");
    await sleep(400);
    // ⚠️ 7-26: 본문을 못 찾고 그냥 진행하면 글 전체가 제목 칸에 들어간다(에러 없음). 반드시 확인
    let f = await ed.focusInfo();
    if (f.inTitle || !f.inComponent) {
      await page.keyboard.press("Enter");
      await sleep(400);
      body = await firstVisible(frame, EDITOR.body);
      if (body) { await body.click(); await sleep(300); }
      f = await ed.focusInfo();
      if (f.inTitle || !f.inComponent) {
        await page.screenshot({ path: shot });
        return { status: "failed", screenshot: shot, note: "본문 입력 칸을 찾지 못해 중단했습니다(글이 제목 칸에 들어가는 것을 막았습니다)" };
      }
    }

    // 섹션 입력
    let skippedImages = 0;
    for (let i = 0; i < input.sections.length; i++) {
      const s = input.sections[i];
      try {
        if (s.type === "heading") {
          if (input.headingAsQuote) await ed.writeQuote(s.text);
          else await ed.writeHeading(s.text);
        } else if (s.type === "paragraph") await ed.writeParagraph(s.text, s.highlight);
        else if (s.type === "quote") await ed.writeQuote(s.text);
        else if (s.type === "divider") await ed.writeDivider();
        else if (s.type === "image") {
          const file = input.images[i];
          if (file) await ed.writeImage(file, s.caption);
          else skippedImages++;
        }
      } catch (e) {
        await page.screenshot({ path: shot }).catch(() => {});
        return { status: "failed", screenshot: shot, stats: ed.stats, note: `${i + 1}번째 블록을 입력하다 멈췄습니다: ${(e as Error).message}` };
      }
      if ((i + 1) % 5 === 0) log(`글 입력 중… ${i + 1}/${input.sections.length}`);
    }
    if (await ed.strikeActive()) log("취소선 버튼이 켜져 있는 것을 발견했습니다", "error");

    // 6. 도움말 + 우측 도크 닫기 (스크린샷 "앞")
    await ed.closeOverlays();
    // 7. 발행 직전 전체 스크린샷
    const ss = await ed.screenshotFull(shot);
    const imgNote = skippedImages ? ` 사진 자리 ${skippedImages}곳은 알맞은 사진이 없어 비웠습니다.` : "";
    const capNote = ed.stats.captionsSkipped ? ` 사진 설명 ${ed.stats.captionsSkipped}개는 넣지 못했습니다.` : "";
    // 7-b. 임시저장만: 저장 버튼만 누르고 끝. 발행 버튼 근처에도 가지 않는다
    if (input.saveDraftOnly) {
      await ed.closeOverlays();
      const saved = await saveDraft(page, frame, log);
      if (saved.ok) {
        keepOpen = Boolean(input.keepOpenAfterSave);
        return { status: "draft_saved", screenshot: ss.file, stats: ed.stats, note: `임시저장했습니다(발행하지 않음). ${saved.how}${imgNote}${capNote}` };
      }
      return { status: "failed", screenshot: ss.file, stats: ed.stats, note: `글 입력은 끝났지만 임시저장을 확인하지 못했습니다: ${saved.how}` };
    }
    // 8. 연습 모드면 여기서 끝
    if (input.dryRun) {
      return { status: "dry_run", screenshot: ss.file, stats: ed.stats, note: `연습 모드라 발행하지 않았습니다. 완성 화면을 저장했습니다.${imgNote}${capNote}` };
    }
    // 9. 다시 닫기 (스크린샷 "뒤" — 그 사이 다시 열렸을 수 있다)
    await ed.closeOverlays();
    // 10. 발행 버튼
    if (!(await clickAnywhere(page, frame, EDITOR.publishOpen))) {
      return { status: "failed", screenshot: ss.file, note: "발행 버튼을 찾지 못했습니다. 글은 임시저장 상태로 남아 있을 수 있습니다" };
    }
    await sleep(1500);
    // 11. 공개 범위 — ⚠️ 7-19: label 클릭 + input.checked 직접 확인. 확인 안 되면 발행하지 않는다(네이버 기본값=전체공개)
    const vis = EDITOR.visibility[input.visibility];
    let checked = false;
    for (const scope of [frame, page] as const) {
      const label = scope.locator(vis.label).first();
      if ((await label.count()) === 0) continue;
      await label.click({ timeout: 5000 }).catch(() => {});
      await sleep(400);
      checked = await scope.locator(vis.input).first().evaluate((el) => (el as HTMLInputElement).checked).catch(() => false);
      if (checked) break;
    }
    if (!checked) {
      await page.screenshot({ path: shot }).catch(() => {});
      return { status: "failed", screenshot: shot, note: `공개 범위(${VISIBILITY_LABEL[input.visibility]})를 확인할 수 없어 발행하지 않고 중단했습니다. 글은 임시저장 상태로 남아 있습니다` };
    }
    log(`공개 범위: ${VISIBILITY_LABEL[input.visibility]} 확인`);
    // 12. 최종 확인
    if (!(await clickAnywhere(page, frame, EDITOR.publishConfirm))) {
      return { status: "failed", screenshot: ss.file, note: "최종 발행 버튼을 찾지 못했습니다. 글은 임시저장 상태로 남아 있습니다" };
    }
    // 13. ⚠️ 7-11: 버튼을 눌렀다 ≠ 발행됐다. 게시글 주소로 바뀌는지 20초 확인
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      const urls = [page.url(), ...page.frames().map((x) => x.url())];
      const postRe = input.entryUrl ? /\/post\/[^/?#]+\/\d{6,}/ : NAVER.postUrlRe; // 하네스는 로컬 주소
      const hit = urls.find((u) => postRe.test(u) && !/Redirect=Write/.test(u));
      if (hit) {
        const m = hit.match(/https?:\/\/[^?#]*?\/[^/?#]+\/\d{6,}/);
        return { status: "published", url: m ? m[0] : hit, screenshot: ss.file, stats: ed.stats, note: `${VISIBILITY_LABEL[input.visibility]}로 발행했습니다.${imgNote}${capNote}` };
      }
      await sleep(500);
    }
    return { status: "failed", screenshot: ss.file, note: "발행 버튼을 눌렀지만 글 주소가 확인되지 않았습니다. 글은 임시저장 상태로 남아 있습니다" };
  } catch (e) {
    return { status: "failed", note: "글쓰기 화면에서 오류: " + (e as Error).message.slice(0, 200) };
  } finally {
    if (input.inspect && pageRef) await input.inspect(pageRef).catch((e) => log("검사 실패: " + (e as Error).message, "warn"));
    if (keepOpen && pageRef && !pageRef.isClosed()) {
      // 사용자가 글을 바로 확인할 수 있게 창을 열어 둔다. 창(또는 브라우저)을 닫으면 끝난다
      await pageRef.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
      log("글쓰기 창을 열어 두었어요. 확인이 끝나면 그 창을 닫아 주세요", "ok");
      await Promise.race([
        pageRef.waitForEvent("close", { timeout: 0 }).catch(() => {}),
        new Promise<void>((r) => browser.on("disconnected", () => r())),
        sleep(input.keepOpenMaxMs ?? 2 * 60 * 60 * 1000),
      ]);
    }
    await browser.close().catch(() => {});
  }
}
