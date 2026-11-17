// 9장 6.5-a: 로그인 전, 로컬 하네스로 입력 "순서" 를 확정한다. (셀렉터 검증이 아니다)
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { chromium, type Page } from "playwright";
import { publishToNaver, type PublishInput } from "@/lib/naver/publish";
import type { Section } from "@/lib/types";

const dir = path.resolve("scripts/harness");
const server = http.createServer((req, res) => {
  const u = new URL(req.url!, "http://x");
  if (u.pathname.startsWith("/post/")) { res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); return res.end("<h1>게시글</h1>"); }
  const f = path.join(dir, u.pathname === "/" ? "outer.html" : u.pathname.slice(1));
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" }); res.end(fs.readFileSync(f));
});
await new Promise<void>((r) => server.listen(0, r));
const port = (server.address() as { port: number }).port;
const base = `http://127.0.0.1:${port}/`;

// 테스트 사진 2장
const imgDir = process.argv[2];
const b = await chromium.launch(); const pg = await b.newPage({ viewport: { width: 600, height: 400 } });
const imgs: string[] = [];
for (const [i, c] of ["#c96", "#69c"].entries()) { await pg.setContent(`<body style="margin:0;background:${c}"></body>`); const f = path.join(imgDir, `h${i}.png`); await pg.screenshot({ path: f }); imgs.push(f); }
await b.close();

const sections: Section[] = [
  { type: "paragraph", text: "주말마다 집에서 커피를 내리다 보니 어느새 작은 카페가 됐어요~ 진짜 별거 없더라구요 ㅎㅎ" },
  { type: "heading", text: "도구는 딱 세 가지면 충분합니다" },
  { type: "paragraph", text: "**드리퍼**와 서버, 그리고 저울만 있으면 됩니다. 가장 중요한 건 물 온도 92도 맞추기예요.", highlight: "물 온도 92도 맞추기" },
  { type: "quote", text: "커피는 결국 물이 절반" },
  { type: "paragraph", text: "인용구 다음에 오는 문단입니다. ⚠️ 뜨거운 물은 조심하세요 ❤️ 1️⃣" },
  { type: "image", query: "드리퍼 클로즈업", caption: "아침 햇살 아래 드리퍼" },
  { type: "paragraph", text: "사진 다음 문단입니다. 캡션과 붙으면 안 됩니다." },
  { type: "divider" },
  { type: "paragraph", text: "구분선 다음 문단입니다." },
  { type: "image", query: "원두", caption: "갓 볶은 원두" },
  { type: "image", query: "없는 자리" },
  ...Array.from({ length: 8 }, (_, i) => ({ type: "paragraph" as const, text: `긴 글을 만들기 위한 ${i + 1}번째 문단입니다. 화면 아래쪽까지 글이 이어지도록 충분히 깁니다. 스크린샷이 글 전체를 담는지 봅니다.` })),
  { type: "quote", text: "마지막 인용구" },
  { type: "paragraph", text: "정말 마지막 문단입니다." },
];
const images = { 5: imgs[0], 9: imgs[1] } as Record<number, string>;

let fail = 0;
const ok = (n: string, c: boolean, x = "") => { console.log(`${c ? "PASS" : "FAIL"}  ${n}${x ? "  — " + x : ""}`); if (!c) fail++; };
const logs: string[] = [];
const run = (q: string, extra: Partial<PublishInput>, inspect?: (p: Page) => Promise<void>) =>
  publishToNaver({ jobId: 9000, title: "홈카페 ⚠️ 시작 가이드", sections, images, headingAsQuote: false, dryRun: false, visibility: "private", headless: true,
    log: (m, l) => logs.push(`${l ?? "info"}: ${m}`), entryUrl: base + q, inspect, ...extra });

// ---- 1. 실제 발행 흐름(하네스)
let dom: Record<string, unknown> = {};
const t0 = Date.now();
const r1 = await run("", {}, async (p) => {
  dom = await p.evaluate(() => ({ url: location.href, reserve: (window as unknown as { __reserveClicks: number }).__reserveClicks }));
});
const sec = ((Date.now() - t0) / 1000).toFixed(0);
console.log("결과:", r1.status, "|", r1.note, "|", r1.url, `| ${sec}초`, JSON.stringify(r1.stats));
ok("발행 성공 + 게시글 주소", r1.status === "published" && /\/post\/harness\/\d+/.test(r1.url ?? ""));
ok("공개 범위 = 비공개 로 발행(기본값 전체공개를 바꿨다)", /vis=open_private/.test(String(dom.url)), String(dom.url));
ok("'예약 발행 0건' 안 눌림", !/reserved/.test(String(dom.url)));

// 에디터 상태는 발행 전 화면을 다시 만들어 검사(연습 모드로 같은 글)
let ed: Record<string, unknown> = {};
const r2 = await run("", { dryRun: true }, async (p) => {
  const f = p.frame({ name: "mainFrame" })!;
  ed = await f.evaluate(`(() => {
    const comps = [...document.querySelectorAll(".se-content .se-component")];
    const txt = (e) => (e?.textContent ?? "").trim();
    const qi = comps.findIndex(c => c.classList.contains("se-quotation"));
    const caps = [...document.querySelectorAll(".se-caption")];
    return {
      strike: window.__strike,
      dim: document.querySelectorAll(".se-popup-dim, .se-popup-container").length,
      help: document.querySelectorAll(".se-help-container, .se-sidebar").length,
      bottom: (document.querySelector(".se-flayer-unified-search-input")).value,
      title: txt(document.querySelector(".TITLE")),
      quoteText: txt(comps[qi]),
      afterQuote: txt(comps[qi + 1]), afterQuoteIsQuote: comps[qi + 1]?.classList.contains("se-quotation"),
      quotes: comps.filter(c => c.classList.contains("se-quotation")).length,
      captions: caps.map(c => ({ t: txt(c), cls: c.className })),
      textHasCaption: comps.filter(c => c.classList.contains("se-text")).some(c => /드리퍼|원두/.test(txt(c)) && /갓 볶은|햇살 아래/.test(txt(c))),
      allText: comps.map(txt).join(" | "),
      heading: !!document.querySelector(".se-fmt-heading"),
      images: document.querySelectorAll(".se-image").length,
    };
  })()`);
});
const all = String(ed.allText);
ok("연습 모드 → 발행 안 함", r2.status === "dry_run");
ok("7-1 취소선 버튼 0회", ed.strike === 0, `${ed.strike}회`);
ok("7-3 복원 팝업·차단막 제거", ed.dim === 0);
ok("7-4/7-21 도움말·우측 도크 닫힘", ed.help === 0);
ok("7-6 글감 검색창으로 새지 않음", ed.bottom === "", JSON.stringify(ed.bottom));
ok("7-7 사진 2장 업로드(멈춤 없음)", ed.images === 2);
ok("7-5 인용구 다음 문단이 인용구 밖", ed.quotes === 2 && ed.quoteText === "커피는 결국 물이 절반" && !ed.afterQuoteIsQuote && /인용구 다음에 오는 문단/.test(String(ed.afterQuote)), JSON.stringify([ed.quoteText, ed.afterQuote]));
ok("7-8 마크다운 무력화", !/\*\*|~/.test(all) && /드리퍼와 서버/.test(all) && /～/.test(all));
ok("7-25 VS16 이모지 중복 없음", !/⚠⚠|❤❤|11️⃣/.test(all + ed.title) && all.includes("⚠️") && all.includes("❤️") && String(ed.title).includes("⚠️"), JSON.stringify(ed.title));
ok("제목 정확", ed.title === "홈카페 ⚠️ 시작 가이드");
const caps = (ed.captions ?? []) as Array<{ t: string; cls: string }>;
const _c = (ed.captions ?? []) as unknown[]; void _c;
ok("7-18 캡션이 사진 설명 칸에(se-is-empty 없음)", caps.length === 2 && caps[0].t === "아침 햇살 아래 드리퍼" && caps[1].t === "갓 볶은 원두" && caps.every((c) => !/se-is-empty/.test(c.cls)), JSON.stringify(caps));
ok("캡션이 다음 문단과 합쳐지지 않음", !ed.textHasCaption && !/드리퍼사진 다음/.test(all));
ok("소제목 서식 적용", ed.heading === true);
ok("빈 사진 자리는 건너뜀", /사진 자리 1곳/.test(r2.note), r2.note);
const shotH = r2.screenshot && fs.existsSync(r2.screenshot) ? (await import("node:child_process")).execSync(`python3 -c "import struct;f=open('${r2.screenshot}','rb');f.read(16);print(struct.unpack('>II',f.read(8))[1])"`).toString().trim() : "0";
ok("7-20 스크린샷에 글 전체(900px 초과)", Number(shotH) > 1400, `높이 ${shotH}px (기기 배율 1)`);
ok("7-27 느리지 않음", Number(sec) < 150, `${sec}초`);

// ---- 2. 본문을 못 찾으면 제목 칸으로 새지 않고 실패 (7-26)
let title2 = "";
const r3 = await run("?nobody=1", {}, async (p) => { title2 = await p.frame({ name: "mainFrame" })!.evaluate(() => document.querySelector(".TITLE")?.textContent ?? ""); });
ok("7-26 본문 못 찾음 → 실패 처리", r3.status === "failed" && /본문/.test(r3.note) && title2 === "홈카페 ⚠️ 시작 가이드", `${r3.note} / 제목칸="${title2}"`);

// ---- 3. 공개 범위를 확인할 수 없으면 발행하지 않는다 (7-19)
let url3 = "";
const r4 = await run("?novis=1", {}, async (p) => { url3 = p.url(); });
ok("7-19 공개 범위 미확인 → 발행 중단", r4.status === "failed" && /공개 범위/.test(r4.note) && !/\/post\//.test(url3), r4.note);

// ---- 4. 복원 팝업 없어도 진행
const r5 = await run("?restore=0", { dryRun: true });
ok("복원 팝업 없는 경우도 진행", r5.status === "dry_run");

// ---- 5. 임시저장만: 저장되고, 발행 레이어는 절대 열리지 않는다
let st: Record<string, unknown> = {};
const t6 = Date.now();
const r6 = await run("", { saveDraftOnly: true, keepOpenAfterSave: true, keepOpenMaxMs: 60000 }, async (p) => { setTimeout(() => p.close().catch(() => {}), 1500); st = await p.evaluate(`({ url: location.href, opened: window.__publishOpened || 0, count: document.getElementById('dc').textContent, wrong: window.__countClicks })`); });
ok("임시저장 후 창 열어둠 → 사용자가 닫으면 끝남", Date.now() - t6 < 55000);
ok("임시저장만 → 저장됨 + 발행 안 함", r6.status === "draft_saved" && st.opened === 0 && !/\/post\//.test(String(st.url)) && st.count === "4" && st.wrong === 0, `${r6.note} / ${JSON.stringify(st)}`);

server.close();
console.log("\n" + logs.filter((l) => !l.startsWith("info")).slice(0, 12).join("\n"));
console.log(fail ? `\n${fail}개 실패` : "\n모두 통과");
console.log("SHOT", r2.screenshot);
process.exit(fail ? 1 : 0);
