// 제품 후기 글 1편 생성 → 조건 검사 → DB 저장(앱 화면에서 보이게). 발행은 하지 않는다.
import fs from "node:fs";
import { getDb } from "@/lib/db";
import { createJob } from "@/lib/pipeline";
import { fillImages } from "@/lib/pipeline";
import { jobLog, setJobStage } from "@/lib/log";
import { describePhotos, listLocalPhotos } from "@/lib/localPhotos";
import { generateModeDraft, sanitizeDraft } from "@/lib/ai/content";
import type { Draft } from "@/lib/types";

const DIR = "data/photos/미오이노시톨";
const KEYWORDS = ["이노시톨"]; // 키워드 마스터 실측: 총 86,700 / 문서 126,685 / 비율 1.461
const facts = `[제품 실물 사진에서 확인한 사실 — 이 범위 밖의 사실은 지어내지 말 것]
- 제품명: 미오이노시톨 콜린&알파 4000 (Myoinositol Choline & Alpha), 브랜드 LAB ON LAB(랩온랩)
- 앞면 표기: 미오이노시톨 4,000mg / 콜린 5mg / 엽산 / 비오틴 / 비타민C / 질유래유산균, 135g(4.5g x 30포), HACCP 인증 마크
- 식품유형: 기타가공품 (건강기능식품 아님)
- 원재료: 이노시톨(인도산) 88.89%, 자일리톨(핀란드산) 2.5%, 비타민C(영국산) 2.3%, 석류농축분말(튀르키예산) 2.13%, 석류향분말, 크랜베리농축분말, 레몬껍질추출물분말(엽산 5%), 효소처리스테비아, 주석산수소콜린(이탈리아산) 0.12%, 산화아연, 10종혼합유산균(프로바이오틱스 10종), 알파-시클로덱스트린(미국산), 비오틴(프랑스산). 우유·대두 포함
- 섭취방법: 1일 1회, 1회 1포를 물과 함께
- 보관: 습기가 적고 직사광선을 받지 않는 실온
- 주의사항: 특이체질·알레르기체질·임신·수유부·질병 치료 중인 분은 원료 확인 후 섭취
- 포장: 분홍색(핑크) 상자, 분홍색 스틱 30포가 상자에 세워져 들어 있음 (⚠️ 보라색이라고 쓰지 마라. 색은 분홍/핑크)
- 스틱마다 쉽게 자를 수 있는 점선(절취선)이 있어 가위 없이 손으로 뜯을 수 있음 → 가방·파우치에 넣어 다니다 언제든 간편하게 챙겨 먹기 좋음 (이 내용을 반드시 넣을 것)
- 제조원 ㈜제이에스바이오, 유통전문판매원 ㈜랩온랩, 소비기한 2028.07.12
[네이버 검색으로 확인한 것]
- 네이버에서 "랩온랩 미오 이노시톨 4000 4.5g 질 유래 유산균 30포" 로 판매되고 있음
- 미오이노시톨 4000mg 제품이 여러 브랜드에서 나오고 있어 사람들이 함량·부원료를 비교해서 고름
[네이버 블로그에서 모은 다른 구매자 후기 10개 — 요약본]
1. 블로거 ohdd** 님: 후기가 좋아서 4개 세트로 샀고, 주문 이틀 만에 도착했다고 함
2. 블로거 ghdr** 님: 500mg 정제 8알 분량을 한 포에 담아 하루 스틱 하나만 챙기면 돼서 간편함이 고른 이유라고 함
3. 블로거 hari** 님: 전에 먹던 알약 대신 한 포로 먹을 수 있고, 원료 원산지가 표기돼 있어 믿음이 갔다고 함. 새콤달콤한 석류맛이라고 함
4. 블로거 wlgm** 님: 영양제 특유의 쓴맛이 없고 석류의 상큼한 맛이라 매일 챙기기 좋았고, 스틱형이라 보관이 간편하다고 함
5. 블로거 rnlt** 님: 핑크 컬러의 심플한 패키지 디자인이 마음에 들었고, 디저트처럼 챙기게 되는 맛이라고 함
6. 블로거 gusd** 님: 큰 알약이 아니라 4.5g 분말 스틱이라 목 넘김 부담이 없고 물과 함께 가볍게 털어 넣기 좋다고 함
7. 블로거 dipo** 님: 아내를 위해 골랐는데, 입안에서 부드럽게 녹고 알약 여러 개 삼킬 때의 거부감이 없어서 좋아했다고 함
8. 블로거 tntk** 님: 매일 아침 식사 직후 정해진 시간에 1포씩 먹는 루틴으로 꾸준히 챙겼다고 함
9. 블로거 thdm** 님: 올리브영에도 입점했고 한 박스 30포라 한 달 루틴 잡기 좋다고 함
10. 블로거 dmsg** 님: 핑크톤 패키지가 깔끔하고 색감이 예쁘다고 함`;

const RULES = `[작성 규칙 — 반드시 지킬 것]
1. 공백 제외 1500자 이상으로 충분히 길게.
2. 핵심 키워드는 "이노시톨" 하나다. "이노시톨" 이라는 글자는 제목+본문+사진설명 전체에서 "미오이노시톨"·제품명 안에 들어간 것까지 모두 합쳐 정확히 7~9번만 나오게 하라(10번 넘으면 키워드 남용으로 불이익). 그중 최소 4번은 "이노시톨" 단독 단어(앞이 띄어쓰기)로 쓴다. 제목 맨 앞부분에 "이노시톨" 포함. 제품명은 제목과 본문 첫 소개 1번 정도만 쓰고 나머지는 "이 제품", "랩온랩 제품", "스틱" 등으로 바꿔 불러라. "이노시톨 추천", "랩온랩 이노시톨" 같은 다른 키워드 조합은 쓰지 마라.
3. image 섹션은 정확히 5개. 이미지 두 개가 연달아 오면 안 된다 — 이미지 사이에 반드시 문단을 2개 이상 둘 것. 첫 이미지 앞에 도입 문단 2개 이상.
4. ⚠️ 이 제품은 건강기능식품이 아닌 "기타가공품"이다. 질병 예방·치료·개선(다낭성, 난임, 임신 성공, 생리불순, 혈당, 다이어트 등) 효과를 말하거나 암시하지 마라. "효과 봤다", "좋아졌다" 같은 체감 효과도 쓰지 마라.
5. 맛·식감·먹은 기간처럼 사진으로 알 수 없는 개인 경험은 지어내지 마라. 대신 상자를 열어본 느낌, 포장, 성분표를 읽어본 내용, 챙겨 먹기 편한 구성, 고를 때 본 기준을 1인칭으로 써라.
6. 가격·할인 정보는 쓰지 마라(수시로 바뀜).
7. 마지막에 "임신·수유 중이거나 치료 중이면 전문가와 상담 후 드세요" 취지의 안내 한 줄.
8. 말투: 딱딱한 "~이었어요/~했어요" 로만 끝내지 말고 "~이에요～", "~더라구요～", "~거든요", "~답니다", "~했어요ㅎㅎ" 처럼 부드럽게 넘어가는 어미를 섞어라. 문장 끝 물결표는 반드시 전각 '～' 문자로만 쓴다(반각 ~ 금지). 모든 문장에 붙이지 말고 문단당 1~2번 정도.
9. "네이버 후기 모아봤어요" 구획을 만들고, 위 다른 구매자 후기 10개를 각각 1~2문장으로 "○○님은 ~라고 하시더라구요" 식으로 소개하라. 블로거 표기는 위에 적힌 그대로(예: 블로거 ohdd** 님). 원문을 베낀 것처럼 쓰지 말고 요약해서 전달하라. 맛 이야기는 다른 분들 후기로만 전하고 내가 먹어본 맛처럼 쓰지 마라. 후기 소개는 문단 3~5개에 나눠 담고, 그 사이에 사진이 와도 된다.
10. 분홍색 스틱에 쉽게 자르는 점선이 있어 휴대하며 언제든 챙겨 먹기 쉽다는 내용을 꼭 넣어라.`;

const db = getDb();
const photos = listLocalPhotos(DIR);
const jobId = createJob({ mode: "review", keyword: "미오이노시톨 콜린&알파 4000 후기", details: facts, photoSource: "local", imageStyle: "photo", photoDir: DIR, placement: "ai" });
const log = (m: string, l: "info" | "warn" | "error" | "ok" = "info") => { jobLog(jobId, m, l); console.log(l, m); };
setJobStage(jobId, "writing", "내 사진 살펴보는 중");
const descs = ["미오이노시톨 콜린&알파 4000 분홍색 제품 상자 앞면", "상자에서 꺼낸 분홍색 스틱 포장", "상자 안에 가득 담긴 분홍색 개별 스틱 30포", "원재료 및 함량 표시면", "측면 주의사항·제조원·소비기한 표기"]; // 지난번 설명 재사용(색만 바로잡음)
void describePhotos;
log("사진 설명: " + descs.join(" / "));

function check(d: Draft) {
  const text = [d.title, ...d.sections.map((s) => ("text" in s ? s.text : "") + ("caption" in s && s.caption ? s.caption : ""))].join("");
  const body = d.sections.map((s) => ("text" in s ? s.text : "")).join("");
  const chars = body.replace(/\s/g, "").length;
  const kw: Record<string, number> = { "이노시톨(전체)": text.split("이노시톨").length - 1, "이노시톨(단독)": (text.match(/(^|[\s(\[\"'“‘])이노시톨/g) ?? []).length };
  const imgIdx = d.sections.map((s, i) => (s.type === "image" ? i : -1)).filter((i) => i >= 0);
  const gaps = imgIdx.slice(1).map((v, i) => v - imgIdx[i]);
  const problems: string[] = [];
  if (chars < 1200) problems.push(`본문 ${chars}자(1200자 미만)`);
  if (kw["이노시톨(전체)"] < 3 || kw["이노시톨(전체)"] > 10) problems.push(`"이노시톨" 전체 ${kw["이노시톨(전체)"]}회(3~10회 아님 — 미오이노시톨·제품명 포함해서 셈)`);
  if (kw["이노시톨(단독)"] < 3) problems.push(`"이노시톨" 단독 ${kw["이노시톨(단독)"]}회(3회 미만)`);
  if (!d.title.includes("이노시톨")) problems.push("제목에 이노시톨 없음");
  if (imgIdx.length !== 5) problems.push(`사진 ${imgIdx.length}장`);
  if (gaps.some((g) => g < 2)) problems.push("사진이 연달아 붙어 있음");
  if (/보라/.test(text)) problems.push("보라색 표현");
  if (!/점선|절취선/.test(text)) problems.push("점선 문구 없음");
  if ((text.match(/님은|님이|님도/g) ?? []).length < 8) problems.push("다른 분 후기 소개가 10개에 못 미침");
  const banned = text.match(/다낭성|난임|임신 성공|치료|개선|효과를 봤|효과 봤|혈당|다이어트|생리불순|좋아졌/g);
  const bannedReal = (banned ?? []).filter((w) => w !== "치료"); // '치료 중인 분' 안내 문구는 허용
  if (bannedReal.length) problems.push("효능 표현: " + [...new Set(bannedReal)].join(","));
  return { chars, kw, gaps, problems };
}

let best: Draft | null = null;
let feedback = "";
for (let attempt = 1; attempt <= 4 && !best; attempt++) {
  setJobStage(jobId, "writing", `본문 쓰는 중 (${attempt}차)`);
  const r = await generateModeDraft("review", "미오이노시톨 콜린&알파 4000 솔직 후기", facts + "\n\n" + RULES + feedback, "local", photos.length, descs);
  if (!r.ok) { log("생성 실패: " + r.error, "warn"); continue; }
  const { draft } = sanitizeDraft(r.data);
  const c = check(draft);
  log(`${attempt}차 검사: 본문 ${c.chars}자, 키워드 ${JSON.stringify(c.kw)}, 사진 간격 ${c.gaps.join(",")} → ${c.problems.length ? "문제: " + c.problems.join(" / ") : "통과"}`, c.problems.length ? "warn" : "ok");
  if (!c.problems.length) best = draft;
  else feedback = `\n\n[이전 원고의 문제 — 반드시 고칠 것]: ${c.problems.join(" / ")}`;
}
if (!best) { setJobStage(jobId, "failed", "조건 미충족", "3번 써봤지만 조건을 모두 맞추지 못했습니다"); process.exit(1); }
const dr = db.prepare("INSERT INTO drafts (job_id, title, body_json) VALUES (?,?,?)").run(jobId, best.title, JSON.stringify(best.sections));
const draftId = Number(dr.lastInsertRowid);
setJobStage(jobId, "imaging", "사진 배치 중");
const imgs = await fillImages(jobId, draftId, best, { photoSource: "local", imageStyle: "photo", photos, photoDescs: descs, placement: "ai" });
db.prepare("INSERT INTO posts (job_id, draft_id, status, note) VALUES (?,?,?,?)").run(jobId, draftId, "pending", "원고 완성 — 네이버 로그인 후 연습 모드로 입력해 볼 수 있습니다");
setJobStage(jobId, "done", "원고 완성");
fs.writeFileSync("data/last-product-job.json", JSON.stringify({ jobId, draftId, images: imgs }, null, 2));
console.log("JOB", jobId);
