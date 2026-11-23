// 데빌톡 애플 사이다 비니거 톡 구미(캔디류) — 매장 사진 5장 기반 정보형 글. 발행하지 않는다.
import fs from "node:fs";
import { runClaudeJson } from "@/lib/claude";
import { DraftBaseSchema, type Draft } from "@/lib/types";
import { SECTION_FORMAT } from "@/lib/ai/templates";
import { sanitizeDraft } from "@/lib/ai/content";

const OUT = "post-20261123-deviltoc";
const KW = "애사비"; // 사용자 지정(2026-11-23). ⚠️ 키워드 마스터 수치 미확인
const URL = "https://search.shopping.naver.com/search/all?query=데빌톡애플사이다비니거톡구미";
const LINK1 = `👉 네이버쇼핑에서 판매처 비교하기: ${URL}`;
const LINK2 = `구매처 링크 한 번 더 남겨둘게요 👉 ${URL}`;
const PHOTOS: Record<string, { file: string; desc: string }> = {
  "사진1": { file: "photo01.jpg", desc: "상자 앞면(브랜드 DevilToc, APPLE CIDER VINEGAR, 사과 그림, 'GELATIN FREE GUMMY' 표시, 제품명, 원료 비율, 270g)" },
  "사진2": { file: "photo02.jpg", desc: "상자 앞면 영문 표기 확대(원료 비율, Pectin Gummies 270g, Biotin+Vitamin E)" },
  "사진3": { file: "photo03.jpg", desc: "상자 측면 표시사항(식품유형 캔디류, 원재료명, 보관방법, 섭취방법, 주의사항, 제조원)" },
  "사진4": { file: "photo04.jpg", desc: "상자 측면 영양정보 표(총 내용량 270g 기준)와 '1일 2구미' 표시, 소비기한" },
  "사진5": { file: "photo05.jpg", desc: "대형마트 매대에 상자가 여러 줄로 쌓여 진열된 모습" },
};
const facts = `[제품 포장 사진에서 확인한 사실 — 이 범위 밖의 제품 사실은 지어내지 말 것]
- 제품명: 데빌톡 애플 사이다 비니거 톡 구미 (DevilToc Apple Cider Vinegar Toc Gummy) / 식품유형: 캔디류(일반 식품, 건강기능식품 아님)
- 내용량: 270g (3g x 90개, 865kcal). 젤라틴을 쓰지 않은 펙틴 구미("GELATIN FREE GUMMY", "Pectin Gummies")
- 앞면: 영국산 사과초모식초분말 700mg(2구미 당) / 바이오틴+비타민E / 사과초모식초분말 11.67%, 사과농축액(사과100%) 1%, 천연향료(사과향) 0.2%, 사과식이섬유 0.0001%
- 원재료명: 프락토올리고당(액상), 프락토올리고당(분말), 사과초모식초분말(사과초모식초, 덱스트린), 정제수, 레몬농축액, 펙틴, 비타민E혼합제제분말, 사과농축액, 구연산, 베지주스, 천연향료(사과향), 구연산삼나트륨, 코팅오일, 석류농축액, 화이트토마토추출분말, 당근농축액, 레드비트농축액, 야채혼합농축액, 비오틴, 건조효모, 산화아연, 사과식이섬유 / 토마토 함유
- 섭취량 및 방법: 1일 1회, 1회 2구미를 씹어서 섭취
- 보관: 고온에 약하니 직사광선을 피해 25℃ 이하 온도가 낮은 곳에 보관, 개봉 후 바로 섭취
- 섭취 시 주의: 특정 성분 알레르기는 원재료명 확인 / 개봉·섭취 시 포장재에 의해 상처를 입을 수 있으니 주의 / 부속품을 함께 삼키지 않도록 주의
- 같은 제조시설 알레르기 안내: 알류(가금류), 우유, 메밀, 땅콩, 대두, 밀, 고등어, 게, 새우, 돼지고기, 복숭아, 아황산류, 호두, 닭고기, 쇠고기, 오징어, 조개류, 잣 사용 제품과 같은 시설. 살균 제품
- 영양정보(총 내용량 270g 기준): 나트륨 590mg, 탄수화물 232g, 당류 126g, 식이섬유 38g, 지방 1.3g, 단백질 0g, 비타민E 495mg α-TE, 바이오틴 13,500μg
- 위 값을 90구미로 나눠 2구미(하루 섭취량) 기준으로 계산한 값(반드시 "제가 총 내용량 표시를 나눠 계산해 본 값" 이라고 밝힐 것): 약 19kcal, 당류 약 2.8g, 식이섬유 약 0.8g, 나트륨 약 13mg, 비타민E 약 11mg α-TE, 바이오틴 약 300μg
- 제조원 ㈜서흥 오송2공장, 유통전문판매원·연구개발 ㈜팜스빌, 품목보고번호 2017041513461, 소비기한 2027.07.11 (사진 속 제품)
- 글쓴이 상황: 대형마트에서 진열된 제품을 보고 포장을 꼼꼼히 읽어본 것(직접 먹어본 경험 없음)
[네이버 블로그 구매자 후기 10개 — 요약본]
1. 블로거 maga 님: 애플사이다비니거를 젤리 타입으로 간편하게 즐길 수 있어 일상 루틴 아이템으로 좋다고 함
2. 블로거 ddlt 님: 식초보다는 상큼한 사과 구미에 가깝고 쫀득한 식감이라고 함
3. 블로거 i-ap 님: 대형마트에서 직접 확인했는데 개별 포장이라 보관·휴대가 편하고 하트 모양이라고 함
4. 블로거 ks10 님: 90구미라 넉넉하고, 액상처럼 강하지 않아 가족과 함께 먹는다고 함
5. 블로거 em28 님: 액상이 부담스러웠던 사람도 젤리 타입이라 비교적 편하게 먹을 수 있다고 함
6. 블로거 im_l 님: 1구미씩 개별 포장이고 하루 2구미 기준 한 달 반 정도 먹을 수 있는 양이라고 함
7. 블로거 gqtg 님: 말티톨·물엿·설탕이 들어가지 않은 식물성 펙틴 구미라는 점이 좋았다고 함
8. 블로거 samo 님: 먹기 전에 성분과 영양정보부터 꼼꼼히 살펴봤다고 함
9. 블로거 pkhh 님: 2구미 기준 성분을 정리하면서, 성분에 과한 기대를 두기보다 간식처럼 챙긴다고 함
10. 블로거 lsr0 님: 개별 위생포장이라 가방이나 책상 서랍에 몇 개 넣어두고 꺼내 먹기 편하다고 함`;
const RULES = `[작성 규칙 — 반드시 지킬 것]
A. 정보형 구성: 서론 → 1~5번 구획 → 마무리. 각 구획 제목은 heading, 바로 다음에 짧은 후킹 문장 paragraph.
   서론에서 "${KW}" 가 애플 사이다 비니거(사과 발효 식초)의 줄임말이라는 걸 한 번 짚어라.
   1. 매장에서 눈에 띈 ${KW} 구미, 어떤 제품일까? (제품명/식품유형/내용량/구미 형태를 "항목 : 내용" 한 줄 문단으로, 목록 기호 금지)
   2. 원재료와 함량 꼼꼼히 보기 (사과초모식초분말 비율과 2구미 700mg, 펙틴·젤라틴 프리, 바이오틴·비타민E, 원재료명)
   3. 영양정보, 2구미 기준으로 계산해 봤어요 (총 내용량 표시 그대로 + 나눠 계산한 값, 계산이라는 점을 밝힐 것)
   4. 섭취 방법과 보관·주의사항
   5. 구매 후기 확인 포인트 (맛과 식감 / 포장과 휴대 / 양과 구성 / 원재료 / 먹는 방식) — 아래 후기 10개를 "블로거 ○○ 님은 ~라고 하시더라구요" 식으로 모두 한 번씩, 표기 그대로
B. ⚠️ 캔디류(일반 식품)다. "다이어트", "체중", "체지방", "살", "혈당", "공복", "디톡스", "붓기", "소화", "장 건강", "피부", "모발", "효과", "효능", "관리" 라는 표현을 쓰지 마라.
   후기에 그런 이야기가 있어도 옮기지 마라. 성분은 들어 있는 양과 표시 사실만 말한다.
C. 글쓴이는 매장에서 보고 포장을 읽어본 사람이다. 먹어본 경험·맛·체감은 지어내지 마라(맛은 후기로만).
D. 핵심 키워드 "${KW}": 제목+본문+사진설명+해시태그 전체에서 정확히 5~8번. 제목 맨 앞에 "${KW}" 를 넣어라. 해시태그에도 1번까지 써도 된다.
   "항목 : 내용" 정보 줄 끝에는 물결표를 붙이지 마라. "마무리하며" 소제목 뒤에는 다른 소제목을 만들지 마라.
E. image 섹션 정확히 5개, query 는 "사진1"~"사진5" 그대로 각 1번. 사진 사이 문단 2개 이상, 첫 사진 앞 문단 2개 이상.
   사진 내용: ${Object.entries(PHOTOS).map(([k, v]) => `${k}=${v.desc}`).join(" / ")}. 내용에 맞는 구획에 두고 caption 을 달아라.
F. 다음 두 문단을 글자 그대로: ① 5번 구획 끝 "${LINK1}" ② 마무리 마지막 안내 문단 바로 앞 "${LINK2}"
G. 마지막: "이 제품은 캔디류(일반 식품)라 건강기능식품이 아니에요" 취지 + 알레르기·포장재 주의 한 줄, 그 다음 해시태그 문단(#데빌톡 #애플사이다비니거 #구미 등 5~8개).
H. 색깔 표현(빨강·레드·분홍·핑크 등 색 이름) 쓰지 마라. 가격 쓰지 마라.
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
  if (kw < 3 || kw > 10) p.push(`"${KW}" ${kw}회(3~10회여야 함)`);
  if (!d.title.includes(KW)) p.push("제목에 키워드 없음");
  if (imgs.length !== 5 || new Set(qs).size !== 5 || !qs.every((q) => q in PHOTOS)) p.push(`사진 query 오류 ${JSON.stringify(qs)}`);
  if (imgs[0] < 2 || imgs.slice(1).some((v, i) => v - imgs[i] < 3)) p.push("사진 간격 부족");
  const color = all.match(/빨강|빨간|붉은|레드|분홍|핑크|보라/g); if (color) p.push("색깔 표현: " + [...new Set(color)].join(","));
  const bl = (all.match(/블로거 [a-z0-9_-]{4} 님/g) ?? []).length; if (bl < 10) p.push(`후기 소개 ${bl}명`);
  if (!all.includes(LINK1) || !all.includes(LINK2)) p.push("링크 문단 누락");
  const ban = all.match(/다이어트|체중|체지방|혈당|공복|디톡스|붓기|소화|장 건강|장건강|피부|모발|효과|효능|관리/g);
  if (ban) p.push("금지 표현: " + [...new Set(ban)].join(","));
  if (!/계산/.test(all)) p.push("2구미 계산값 안내 누락");
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
