// 계정 없이 확인 가능한 것들 (10장 A)
import path from "node:path";
import { chromium } from "playwright";
import { neuronsPerImage, imagesPerDay } from "@/lib/ai/neurons";
import { neutralizeMarkdown, sanitizeDraft } from "@/lib/ai/content";
import { extractJson } from "@/lib/claude";
import { filterLinks } from "@/lib/scrape/trends";
import { isInsideData } from "@/lib/paths";
import { getDb } from "@/lib/db";
import { getSettings, updateSettings, resetSettings } from "@/lib/settings";
import { checkPublishGuards } from "@/lib/naver/publish";
import { draftSchemaFor } from "@/lib/types";

let fail = 0;
const ok = (name: string, cond: boolean, extra = "") => { console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`); if (!cond) fail++; };

// 7-12 뉴런 표
const exp: Record<number, [number, number]> = { 2: [96, 104], 4: [173, 57], 6: [250, 40], 8: [326, 30] };
for (const [st, [n, d]] of Object.entries(exp)) ok(`뉴런 ${st}스텝`, Math.round(neuronsPerImage(+st)) === n && imagesPerDay(+st) === d, `${neuronsPerImage(+st)} / ${imagesPerDay(+st)}장`);
ok("뉴런 6스텝 실수값(반올림 전)", Math.abs(neuronsPerImage(6) - 249.6) < 1e-9);

// extractJson
ok("JSON 코드펜스", extractJson('좋아요!\n```json\n{"a":[1,2]}\n```\n끝') === '{"a":[1,2]}');
ok("JSON 앞뒤 말", JSON.parse(extractJson('결과는 다음과 같습니다: [{"t":"a}b"}] 이상입니다')!)[0].t === "a}b");

// 7-8 마크다운 무력화
const md = neutralizeMarkdown("**굵게** 그렇죠~~ 좋아요~\n# 제목\n> 인용\n- 목록 `코드`");
ok("마크다운 무력화", !/[*#>`~]|^- /m.test(md), JSON.stringify(md));

// 7-24 highlight
const sd = sanitizeDraft({ title: "t테스트", sections: [
  { type: "paragraph", text: "옆 사이트는 한 시간째 폴대와 씨름 중이더라고요. 그때 확신했습니다.", highlight: "예쁜 것보다 빨리 펴지는 게 훨씬 중요합니다" },
  { type: "paragraph", text: "가볍고 빨리 펴지는 텐트가 최고입니다.", highlight: "빨리 펴지는 텐트" },
  { type: "image", query: "q" }, { type: "divider" } ] });
ok("지어낸 highlight 제거", sd.droppedHighlights === 1 && !("highlight" in sd.draft.sections[0]) && (sd.draft.sections[1] as { highlight?: string }).highlight === "빨리 펴지는 텐트");

// 소스별 이미지 개수 스키마
const mk = (n: number) => ({ title: "제목입니다", sections: [{ type: "paragraph", text: "a" }, { type: "paragraph", text: "b" }, { type: "paragraph", text: "c" }, ...Array.from({ length: n }, () => ({ type: "image", query: "q" }))] });
ok("crawl 6개 강제", !draftSchemaFor("crawl").safeParse(mk(5)).success && draftSchemaFor("crawl").safeParse(mk(6)).success);
ok("local 정확히 N개", draftSchemaFor("local", 4).safeParse(mk(4)).success && !draftSchemaFor("local", 4).safeParse(mk(6)).success);
ok("none 이미지 금지", !draftSchemaFor("none").safeParse(mk(1)).success);

// 6-4 수집 필터
const links = [
  { href: "https://help.naver.com/alias/news/news_21.naver", text: "뉴스 기사와 댓글로 인한 문제 발생시 24시간 센터로 접수해주세요", around: "" },
  { href: "https://n.news.naver.com/article/001/0000001", text: "네이버뉴스새 창 열림", around: "" },
  { href: "https://n.news.naver.com/article/001/0000002", text: "정부, 내년 관광 예산 20% 늘린다", around: "정부, 내년 관광 예산 20% 늘린다 요약 문장입니다" },
  { href: "https://n.news.naver.com/article/001/0000002", text: "정부가 내년 관광 예산을 올해보다 20% 늘리기로 했다고 17일 밝혔다. 이는...", around: "" },
  { href: "https://blog.naver.com/someone", text: "누군가의 블로그 홈 링크입니다", around: "" },
];
const fn = filterLinks(links, "news");
ok("고객센터·새창열림 제외 + URL 중복 제거(짧은 제목)", fn.length === 1 && fn[0].title === "정부, 내년 관광 예산 20% 늘린다", JSON.stringify(fn.map(x => x.title)));
ok("블로그 홈 링크 제외", filterLinks(links, "blog").length === 0);

// 7-23 NFD 루트 vs NFC 경로
const rootNfd = "/Users/나/블로그앱/data".normalize("NFD");
ok("NFD/NFC 경로 비교", isInsideData("/Users/나/블로그앱/data/images/a.png".normalize("NFC"), rootNfd));
ok("경로 탈출 거부", !isInsideData("/Users/나/블로그앱/data/../secret", rootNfd) && !isInsideData("/Users/나/블로그앱/data2/x", rootNfd));

// 발행 가드 + 7-22 로컬 날짜
const db = getDb();
db.exec("DELETE FROM posts WHERE job_id = -1");
resetSettings();
const base = { ...getSettings(), dryRun: false };
ok("가드: 기록 없음 → 통과", checkPublishGuards(base).ok);
ok("가드: 전체 중단", !checkPublishGuards({ ...base, killSwitch: true }).ok);
// 한국시간 오늘 새벽 시각(UTC 로는 '어제' 일 수 있음)을 2건 넣는다
const tz = process.env.TZ;
const localDawn = db.prepare("SELECT datetime(date('now','localtime') || ' 02:00:00', 'utc') AS t").get() as { t: string };
db.prepare("INSERT INTO posts (job_id, status, published_at) VALUES (-1,'published',?)").run(localDawn.t);
db.prepare("INSERT INTO posts (job_id, status, published_at) VALUES (-1,'published',datetime('now','-5 minutes'))").run();
const n = (db.prepare("SELECT COUNT(*) AS n FROM posts WHERE job_id=-1 AND date(published_at,'localtime') = date('now','localtime')").get() as { n: number }).n;
const wrong = (db.prepare("SELECT COUNT(*) AS n FROM posts WHERE job_id=-1 AND date(published_at) = date('now','localtime')").get() as { n: number }).n;
ok("로컬 날짜 집계", n === 2, `localtime 집계 ${n}건 / 틀린 집계 ${wrong}건 (TZ=${tz})`);
const g1 = checkPublishGuards({ ...base, dailyPublishLimit: 2 });
ok("가드: 하루 한도", !g1.ok, g1.ok ? "" : g1.reason);
const g2 = checkPublishGuards({ ...base, dailyPublishLimit: 50, minPublishIntervalMin: 30 });
ok("가드: 발행 간격", !g2.ok, g2.ok ? "" : g2.reason);
ok("가드: 간격 0 + 한도 여유 → 통과", checkPublishGuards({ ...base, dailyPublishLimit: 50, minPublishIntervalMin: 0 }).ok);
db.exec("DELETE FROM posts WHERE job_id = -1");

// 설정 클램프/리셋
const cl = updateSettings({ dailyPublishLimit: 0, claudeConcurrency: 99, visibility: "nope" });
ok("설정 클램프", cl.dailyPublishLimit === 1 && cl.claudeConcurrency === 6 && cl.visibility === "private");
let threw = false; try { updateSettings({ nope: 1 }); } catch { threw = true; }
ok("알 수 없는 설정 거절", threw);
const rs = resetSettings();
ok("리셋 → 기본값(연습 모드·비공개)", rs.dryRun && rs.visibility === "private" && rs.dailyPublishLimit === 3);

// 7-1, 7-2 최소 재현
const b = await chromium.launch();
const p = await b.newPage();
await p.setContent(`<div class="se-toolbar"><button>취소선</button><button>예약 발행 0건</button></div>
  <div class="se-popup-container"><button>취소</button></div>
  <button data-click-area="tpb.publish">발행</button>`);
const c1 = await p.locator("button:has-text('취소')").count();
const c2 = await p.locator(".se-popup-container button:text-is('취소')").count();
const c3 = await p.locator("button:text-is('취소')").count();
ok("7-1 취소 셀렉터", c1 === 2 && c2 === 1 && c3 === 1, `has-text ${c1}개 / text-is ${c3}개 / 팝업 스코프 ${c2}개`);
const d1 = await p.locator("button:has-text('발행')").count();
const d2 = await p.locator("button[data-click-area='tpb.publish']").count();
ok("7-2 발행 셀렉터", d1 === 2 && d2 === 1, `has-text ${d1}개 / 데이터속성 ${d2}개`);
await b.close();

console.log(fail ? `\n${fail}개 실패` : "\n모두 통과");
process.exit(fail ? 1 : 0);
