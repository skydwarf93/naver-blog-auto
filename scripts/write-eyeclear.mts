// 종근당건강 아이클리어 루테인지아잔틴 미니캡슐 — 매장 사진 5장 기반 정보형 글. post-eyeclear/post.json 저장. 발행하지 않는다.
import fs from "node:fs";
import { runClaudeJson } from "@/lib/claude";
import { DraftBaseSchema, type Draft } from "@/lib/types";
import { SECTION_FORMAT } from "@/lib/ai/templates";
import { sanitizeDraft } from "@/lib/ai/content";

const OUT = "post-eyeclear";
const KW = "루테인"; // 사용자 지정(2026-11-23). ⚠️ 키워드 마스터 수치 미확인
const URL = "https://search.shopping.naver.com/search/all?query=아이클리어루테인지아잔틴미니캡슐";
const LINK1 = `👉 네이버쇼핑에서 판매처 비교하기: ${URL}`;
const LINK2 = `구매처 링크 한 번 더 남겨둘게요 👉 ${URL}`;
const PHOTOS: Record<string, { file: string; desc: string }> = {
  "사진1": { file: "photo01.jpg", desc: "매장에 진열된 3개입 묶음 제품 정면(브랜드·제품명·'구매율·섭취율 1위' 문구, 박스 3개)" },
  "사진2": { file: "photo02.jpg", desc: "대형마트 진열대에 쌓여 있는 제품 매대 전경" },
  "사진3": { file: "photo03.jpg", desc: "포장 뒷면 영양·기능정보 표(루테인 18.2mg, 총 지아잔틴 1.8mg, 비타민A, 비타민E)" },
  "사진4": { file: "photo04.jpg", desc: "포장 뒷면 인체적용시험 결과 안내와 '이런 분들께 권합니다' 부분" },
  "사진5": { file: "photo05.jpg", desc: "포장 뒷면 핵심 Point 3가지와 원료명·섭취방법·주의사항" },
};
const facts = `[제품 포장 사진에서 확인한 사실 — 이 범위 밖의 제품 사실은 지어내지 말 것]
- 제품명: 종근당건강 아이클리어 루테인지아잔틴 미니캡슐 / 식품유형: 건강기능식품
- 박스 1개: 3.36g(1캡슐당 112mg x 30캡슐). 매장 제품은 박스 3개 묶음(총 10.08g, 112mg x 30캡슐 x 3개입)
- 1일 섭취량 1캡슐(112mg)당: 루테인 18.2mg, 총 지아잔틴 1.8mg(합계 루테인지아잔틴 20mg), 비타민A 400μgRAE(영양성분기준치 57%), 비타민E 10mg α-TE(91%), 열량 0kcal
- 기능정보(포장 문구 그대로): [루테인지아잔틴복합추출물] 노화로 인해 감소될 수 있는 황반색소밀도를 유지하여 눈 건강에 도움을 줄 수 있음 /
  [비타민A] 어두운 곳에서 시각 적응을 위해 필요, 피부와 점막을 형성하고 기능을 유지하는데 필요, 상피세포의 성장과 발달에 필요 / [비타민E] 항산화 작용을 하여 유해산소로부터 세포를 보호하는데 필요
- 핵심 Point(포장): ① 루테인지아잔틴 20mg 함유 ② 112mg 초소형 미니캡슐로 목넘김을 편하게 ③ 원료와 캡슐 모두 식물성 원료 사용
- 포장 앞면 "구매율·섭취율 1위" (출처 표기: 2018 건강기능식품협회 소비자만족도조사 루테인부문)
- 포장 뒷면 인체적용시험 안내: 기능성원료 루테인지아잔틴복합추출물 인체적용시험 결과 황반색소밀도 증가 / 시험대상 45~65세 남녀 60명, 시험기간 180일(6개월), 섭취량 루테인지아잔틴 20mg, 무작위 배정·이중맹검 / *모든 사람에게 동일하게 적용되는 것은 아님
- 원료명 일부: 루테인지아잔틴복합추출물(해바라기유 등, 인도산), d-α-토코페롤(대두유), 비타민A혼합제제(레티닐팔미트산염, 땅콩오일 등), 성전분, 글리세린, 카라기난, 안나토색소 / 땅콩·대두 함유
- 섭취방법: 1일 1회, 1회 1캡슐(112mg)을 충분한 물과 함께
- 섭취 시 주의(포장): 과다 섭취 시 일시적으로 피부가 황색으로 변할 수 있음 / 영·유아, 어린이, 임산부 및 수유부는 섭취를 피할 것 / 흡연자는 섭취 시 전문가와 상담 / 특이체질·알레르기 체질은 원료명 확인 / 이상사례 발생 시 섭취 중단 후 상담
- 보관: 직사광선과 고온다습한 곳을 피해 건조한 곳에 실온 보관, 어린이 손이 닿지 않는 곳
- 유통전문판매원 종근당건강㈜, 제조원 ㈜알피바이오
- 글쓴이 상황: 대형마트 영양제 코너에서 진열된 제품을 보고 포장을 꼼꼼히 읽어본 것(직접 먹어본 경험은 없음)
[네이버 블로그 구매자 후기 10개 — 요약본]
1. 블로거 jhse 님: 대형마트 영양제 코너에서 쉽게 찾을 수 있었고, 하루 1캡슐을 식후에 챙긴다고 함
2. 블로거 lady 님: 식물성 캡슐이고 크기를 줄여 알약을 잘 못 먹는 사람도 편하게 먹을 수 있다고 소개함
3. 블로거 love 님: 박스 3개에 각 30캡슐이 들어 있고, 큰 알약을 힘들어하는데 크기가 작아 목넘김이 쉬웠다고 함
4. 블로거 jylh 님: 직접 구입했고 포장의 핵심 포인트 3가지(20mg·미니캡슐·식물성)를 하나씩 정리함
5. 블로거 yash 님: 6개월분 구성을 할인할 때 구매했고, 종이박스마다 30캡슐씩과 설명서가 들어 있었다고 함
6. 블로거 hju4 님: 박스 3개가 한 세트로 묶인 구성이라고 소개함
7. 블로거 skal 님: 여러 제품을 비교한 끝에 부모님께 드리려고 6개월분을 구매했다고 함
8. 블로거 pk_u 님: 1캡슐 기준 루테인 약 18.182mg, 지아잔틴 약 1.818mg 표시를 확인했고 캡슐 크기와 섭취 방법도 확인하라고 함
9. 블로거 bara 님: 앞면 숫자보다 하루 섭취량과 원료명을 읽으라고 하며, 제조원(알피바이오)까지 확인함
10. 블로거 howt 님: 대형마트에 30캡슐 3개입 구성으로 진열돼 있었다고 소개함`;

const RULES = `[작성 규칙 — 반드시 지킬 것]
A. 정보형 구성: 서론 → 1~5번 구획 → 마무리. 각 구획 제목은 heading, 바로 다음에 짧은 후킹 문장 paragraph.
   1. 매장에서 눈에 띈 제품, 어떤 제품일까? (제품명/구성/1캡슐 무게/식품유형을 "항목 : 내용" 한 줄 문단으로, 목록 기호 금지)
   2. 핵심 성분 4가지 (루테인·지아잔틴·비타민A·비타민E — 함량과 포장의 기능정보 문구)
   3. 이런 분들이라면 살펴볼 만해요 (큰 캡슐 삼키기 부담스러운 분 / 식물성 캡슐을 찾는 분 / 하루 1캡슐로 간단히 챙기고 싶은 분 / 가족과 나눠 챙길 3개입 구성을 찾는 분)
   4. 섭취 방법과 주의사항 (포장 문구 기반: 황색 피부, 영유아·어린이·임산부·수유부, 흡연자, 땅콩·대두, 보관)
   5. 구매 후기 확인 포인트 (목넘김/구성과 포장/성분 표시 확인/구매처와 구성/선물·가족용) — 아래 후기 10개를 "블로거 ○○ 님은 ~라고 하시더라구요" 식으로 모두 한 번씩, 표기 그대로
B. ⚠️ 건강기능식품 광고 규칙: 기능성은 포장의 기능정보 문구 그대로만 써라("노화로 인해 감소될 수 있는 황반색소밀도를 유지하여 눈 건강에 도움을 줄 수 있음").
   "침침한 눈", "흐릿한 눈", "희미한 눈", "선명", "시력", "개선", "치료", "예방", "노안", "눈 노화", "피로", "안구건조", "효과" 라는 표현을 쓰지 마라.
   인체적용시험은 포장 안내 그대로 소개하고 "모든 사람에게 동일하게 적용되는 것은 아님" 을 함께 써라. "구매율·섭취율 1위" 는 출처(2018 건강기능식품협회 소비자만족도조사 루테인부문)와 함께 "포장에 표기" 로만.
C. 글쓴이는 매장에서 보고 포장을 읽어본 사람이다. 먹어본 경험·맛·체감은 지어내지 마라(후기는 다른 분들 이야기로만).
D. 핵심 키워드 "${KW}": "${KW}" 글자는 제목+본문+사진설명+해시태그 전체에서 제품명·"루테인지아잔틴"·"루테인지아잔틴복합추출물"·성분명 안에 든 것까지 모두 합쳐 정확히 6~9번만 나와야 한다(10번 넘으면 키워드 남용).
   제목 맨 앞에 "${KW}" 를 단독 단어로. 제품의 정식 이름(…루테인지아잔틴 미니캡슐)은 본문 첫 소개 1번만 쓰고, 그 밖에는 "아이클리어 미니캡슐", "이 제품" 으로 불러라.
   기능정보 문구는 1번만 인용하고, 성분 설명은 "루테인 18.2mg, 지아잔틴 1.8mg" 처럼 필요한 곳에만. 후기 소개·주의사항·해시태그·사진 설명에는 "${KW}" 글자를 쓰지 마라(함량 숫자는 "1캡슐 성분 표시" 로 바꿔 말하라).
   "항목 : 내용" 정보 줄 끝에는 물결표를 붙이지 마라. "마무리하며" 소제목 뒤에는 다른 소제목을 만들지 마라.
E. image 섹션 정확히 5개, query 는 "사진1"~"사진5" 그대로 각 1번. 사진 사이 문단 2개 이상, 첫 사진 앞 문단 2개 이상.
   사진 내용: ${Object.entries(PHOTOS).map(([k, v]) => `${k}=${v.desc}`).join(" / ")}. 내용에 맞는 구획에 두고 caption 을 달아라.
F. 다음 두 문단을 글자 그대로: ① 5번 구획 끝 "${LINK1}" ② 마무리 마지막 안내 문단 바로 앞 "${LINK2}"
G. 마지막: "건강기능식품은 질병의 예방 및 치료를 위한 의약품이 아니에요" 취지 안내 + 영유아·임산부 등 섭취 주의 한 줄, 그 다음 해시태그 문단(#아이클리어 #종근당건강 #미니캡슐 #눈영양제 등 5~8개).
H. 색깔 표현(분홍·핑크·파랑·보라 등) 쓰지 마라. 가격 쓰지 마라.
I. 말투: "~이에요～", "~더라구요～", "~거든요", "~답니다" 를 문단당 1~2번 섞어라. 물결표는 전각 '～' 만.
J. 공백 제외 1500자 이상.`;

function check(d: Draft) {
  const all = [d.title, ...d.sections.map((s) => ("text" in s ? s.text : "") + ("caption" in s && s.caption ? " " + s.caption : ""))].join("\n");
  const body = d.sections.map((s) => ("text" in s ? s.text : "")).join("");
  const p: string[] = [];
  const chars = body.replace(/\s/g, "").length;
  const kw = all.split(KW).length - 1;
  const imgs = d.sections.map((s, i) => (s.type === "image" ? i : -1)).filter((i) => i >= 0);
  const qs = d.sections.filter((s) => s.type === "image").map((s) => (s as { query: string }).query.trim());
  if (chars < 1200) p.push(`본문 ${chars}자`);
  if (kw < 3 || kw > 10) p.push(`"${KW}" ${kw}회(3~10회여야 함 — 제품명·루테인지아잔틴 안의 것까지 셈)`);
  if (!d.title.includes(KW)) p.push("제목에 키워드 없음");
  if (imgs.length !== 5 || new Set(qs).size !== 5 || !qs.every((q) => q in PHOTOS)) p.push(`사진 query 오류 ${JSON.stringify(qs)}`);
  if (imgs[0] < 2 || imgs.slice(1).some((v, i) => v - imgs[i] < 3)) p.push("사진 간격 부족");
  const color = all.match(/분홍|핑크|파랑|파란|보라|퍼플|남색/g); if (color) p.push("색깔 표현: " + [...new Set(color)].join(","));
  const bl = (all.match(/블로거 [a-z0-9_]{4} 님/g) ?? []).length; if (bl < 10) p.push(`후기 소개 ${bl}명`);
  if (!all.includes(LINK1) || !all.includes(LINK2)) p.push("링크 문단 누락");
  const ban = all.match(/침침|흐릿|희미|선명|시력|개선|치료하|예방하|노안|눈 노화|눈노화|피로|안구건조|효과|효능/g);
  if (ban) p.push("금지 표현: " + [...new Set(ban)].join(","));
  if (!/모든 사람에게 동일하게 적용되는 것은 아/.test(all)) p.push("인체적용시험 단서 누락");
  if (!d.title.trimStart().startsWith(KW)) p.push("제목이 키워드로 시작하지 않음");
  const hs = d.sections.map((s, i) => ((s.type === "heading" || s.type === "quote") && /마무리/.test((s as { text: string }).text) ? i : -1)).filter((i) => i >= 0);
  if (hs.length && d.sections.slice(hs[0] + 1).some((s) => s.type === "heading" || s.type === "quote")) p.push("마무리 뒤에 소제목이 있음");
  if (d.sections.some((s) => s.type === "paragraph" && /^[^:]{1,10} : .*～$/.test(s.text))) p.push("정보 줄 끝에 물결표");
  return { chars, kw, imgs, p };
}

let best: Draft | null = null, fb = "";
for (let a = 1; a <= 4 && !best; a++) {
  const r = await runClaudeJson(`${facts}\n\n${RULES}${fb}\n\n${SECTION_FORMAT}`, DraftBaseSchema);
  if (!r.ok) { console.log("생성 실패", r.error.slice(0, 200)); continue; }
  const { draft } = sanitizeDraft(r.data);
  const c = check(draft);
  console.log(`${a}차: 본문 ${c.chars}자, ${KW} ${c.kw}회, 사진 위치 ${c.imgs.join(",")} → ${c.p.length ? "문제: " + c.p.join(" / ") : "통과"}`);
  if (!c.p.length) best = draft; else fb = `\n\n[이전 원고의 문제 — 반드시 고칠 것]: ${c.p.join(" / ")}`;
}
if (!best) process.exit(1);
const images: Record<string, string> = {};
best.sections.forEach((s, i) => { if (s.type === "image") images[String(i)] = PHOTOS[s.query.trim()].file; });
fs.writeFileSync(`${OUT}/post.json`, JSON.stringify({ title: best.title, sections: best.sections, images, headingAsQuote: true }, null, 2));
console.log("저장:", `${OUT}/post.json`, images);
