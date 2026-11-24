// 데빌톡 애플 사이다 비니거 톡 구미(캔디류) — 매장 사진 5장 기반 정보형 글. 발행하지 않는다.
import fs from "node:fs";
import { runClaudeJson } from "@/lib/claude";
import { DraftBaseSchema, type Draft } from "@/lib/types";
import { SECTION_FORMAT } from "@/lib/ai/templates";
import { sanitizeDraft } from "@/lib/ai/content";

const OUT = "post-20261124-lusol2";
const KW = "루솔 배도라지즙"; // 사용자 지정(2026-11-24). 띄어쓰기 포함 그대로 센다. ⚠️ 키워드 마스터 수치 미확인
const URL = "https://search.shopping.naver.com/search/all?query=루솔진한배도라지즙비타플러스";
const LINK1 = `👉 네이버쇼핑에서 판매처 비교하기: ${URL}`;
const LINK2 = `구매처 링크 한 번 더 남겨둘게요 👉 ${URL}`;
const userDraft = fs.readFileSync("scripts/lusol-user-draft.txt", "utf8");
const PHOTOS: Record<string, { file: string; desc: string }> = {
  "사진1": { file: "photo01.jpg", desc: "상자 앞면 전체(제품명, 비타플러스, 액상차 3L 표기)" },
  "사진2": { file: "photo02.jpg", desc: "상자 위쪽 인증 표시(비타민 B2·B5·B6 함유, HACCP, CCM)" },
  "사진3": { file: "photo03.jpg", desc: "상자 앞면 아래쪽 함량 표기(배 84%, 도라지 14.8% 등)" },
  "사진4": { file: "photo04.jpg", desc: "상자 영양정보 표(1개입 100ml당, 총 내용량당)" },
  "사진5": { file: "photo05.jpg", desc: "상자 표시사항 표(제품명, 식품유형, 원재료명, 보관방법, 주의 문구)" },
};
const facts = `[제품 포장 사진에서 확인한 사실 — 이 범위 밖의 제품 사실은 지어내지 말 것]
- 제품명: 루솔 진한 배도라지즙 비타플러스 (Pear & Balloon Flower Drink) / 식품유형: 액상차(일반 식품)
- 내용량: 3L (1,164kcal, 100ml x 30개입)
- 원재료명및함량: 배(국산) 84%, 도라지(국산) 14.8%, 판토텐산칼슘(0.002%), 비타민B6염산염(0.0007%), 비타민B2(0.0005%), 정제수
- 상자 표시: 비타민 B2·B5·B6 함유 / 안전관리인증 HACCP(식품의약품안전처) / CCM 소비자중심(공정거래위원회)
- 영양정보 1개입(100ml)당: 40kcal, 나트륨 2mg(0%), 탄수화물 10g(3%), 당류 8g(8%), 지방 0g, 트랜스지방 0g, 포화지방 0g, 콜레스테롤 0mg, 단백질 0g, 비타민B2 0.3mg(21%), 비타민B6 0.2mg(13%), 판토텐산 1.1mg(22%)
- 영양정보 총 내용량(3L)당: 나트륨 50mg, 탄수화물 291g, 당류 234g, 비타민B2 9mg, 비타민B6 6mg, 판토텐산 33mg
- 보관방법: 실온보관(직사광선을 피하여 서늘한 곳에 보관하고 개봉 후 즉시 섭취)
- 주의 문구: 우유·대두를 사용한 제품과 같은 제조시설에서 제조 / 원료 성분에 의해 침전물이 생길 수 있으니 잘 흔들어 섭취 / 용기는 전자레인지용이 아니므로 사용 금지 / 유통 과정에서 변질된 제품은 구입처나 고객상담실에서 교환 / 제품이 부푼 경우 섭취하지 말고 반품·교환
- 제조원 농업회사법인 유한회사 자연식품, 유통전문판매원 ㈜에르코스농업회사법인, 품목보고번호 2016052524451
[네이버 블로그 구매자 후기 10개 — 요약본]
1. 블로거 chil 님: 직접 구매해 아이에게 먹이는 쟁여템이고, 국산 배·도라지가 주원료에 비타민까지 더해진 점을 보고 골랐다고 함
2. 블로거 firs 님: 가족이 꾸준히 마실 음료를 고민 끝에 골랐고 아이들이 매일 하나씩 마신다고 함
3. 블로거 reum 님: 온라인에서는 기본 배도라지즙을 팔고, 비타민을 더한 이 구성은 대형마트 전용 상품이라고 소개함
4. 블로거 hasu 님: 성분표를 꼼꼼히 따져보고 골랐는데 달달한 배 맛 덕분에 도라지의 쌉싸름한 맛이 거의 안 나 아이들이 마시기 좋다고 함
5. 블로거 pupu 님: 대형마트에서만 파는 비타플러스 구성이 있길래 사봤다고 함
6. 블로거 sudy 님: 개별 포장이라 외출이나 등원할 때 가방에 챙기기 좋고 재구매하게 됐다고 함
7. 블로거 redm 님: 도라지의 쓴맛은 줄고 배의 은은한 단맛이 살아 있다고 함
8. 블로거 happ 님: 아이부터 어른까지 온 가족이 함께 마실 수 있고 아이들도 잘 마신다고 함
9. 블로거 yeon 님: 아이가 잘 먹던 브랜드 제품을 대형마트에서 판매하는 걸 보고 반가웠다고 함
10. 블로거 lucy 님: 대형마트에서 비타플러스 판매를 시작한 걸 보고 다음에 기존 제품과 비교해 보고 싶다고 함`;

const RULES = `[작성 규칙 — 반드시 지킬 것]
A. 위 [사용자 원고]의 구성(서론 → 1~5번 → 마무리), 후킹 문장(< > 안의 문장), 문장 흐름을 최대한 그대로 살려라. 1~5번 제목은 heading, 후킹 문장은 바로 다음 paragraph("< >" 기호는 빼고).
   원고의 목록(*)은 "항목 : 내용" 또는 "① …" 한 줄 문단으로 바꿔라(목록 기호 금지).
B. 사용자 요청: 소비기한·유통기한 이야기는 한 글자도 넣지 마라(날짜 포함).
C. 원고에서 고칠 것: 판매처 리뷰 퍼센트(SSG 76% 등)·'제조사 소개 자료'·'중탕' 같은 확인 안 된 내용은 빼라. "하루에 한 포씩" 같은 섭취 기준은 포장에 없으니 쓰지 마라.
   ⚠️ 액상차(일반 식품)다. "목", "기관지", "감기", "기침", "콧물", "비염", "면역", "효과", "효능", "치료", "예방", "에너지 생성", "대사" 같은 신체 기능·질병 표현을 쓰지 마라. 서론도 날씨·일교차 이야기에서 바로 음료로 넘어가라.
   비타민 3번 구획은 각 비타민의 이름·원재료명 표기·1개입 함량·기준치 비율만 말하고 기능 설명은 하지 마라. 마지막에 "건강기능식품이 아니라 음료" 라는 원고의 안내는 살려라.
D. 5번 구획: 위 후기 10개를 맛 / 포장과 휴대 / 구성과 구매처 / 가족이 함께 / 고른 이유 포인트로 나눠 "블로거 ○○ 님은 ~라고 하시더라구요" 식으로 모두 한 번씩(표기 그대로). 포인트 이름은 소제목이 아니라 문단 앞 "① 맛 :" 처럼 붙여라.
   그 뒤에 원고의 "구매 전 확인할 점" 을 포장 주의 문구 기반으로.
E. 핵심 키워드 "${KW}"(띄어쓰기 포함, 글자 그대로): 제목+본문 전체에서 정확히 5~8번. 제목은 "${KW}" 로 시작. 서론·각 구획·마무리에 자연스럽게 나눠 넣어라(한 문단에 2번 이상 금지).
   제품 정식 이름 "루솔 진한 배도라지즙 비타플러스" 는 첫 소개 1번만, 그 외엔 "이 제품", "비타플러스" 로. 해시태그는 원고 것 그대로 둬도 된다.
F. image 섹션 정확히 5개, query 는 "사진1"~"사진5" 그대로 각 1번, ⚠️ caption 은 넣지 마라(사용자 요청: 사진에 글 없음). 사진 사이 문단 2개 이상, 첫 사진 앞 문단 2개 이상.
   사진 내용: ${Object.entries(PHOTOS).map(([k, v]) => `${k}=${v.desc}`).join(" / ")}. 내용에 맞는 구획에 둬라.
G. 다음 두 문단을 글자 그대로: ① 5번 구획 끝 "${LINK1}" ② 마무리의 마지막 문단(해시태그 바로 앞 안내) 바로 앞 "${LINK2}". "마무리" 소제목 뒤에는 다른 소제목을 만들지 마라.
H. 색깔 표현(보라·주황 등 색 이름) 쓰지 마라(💜 이모지는 원고대로 둬도 됨). 가격 쓰지 마라.
I. 말투: 원고 말투를 살리되 "~이에요～", "~더라구요～", "~거든요", "~답니다" 를 문단당 1~2번 섞어라. 물결표는 전각 '～' 만. "항목 : 내용" 줄 끝엔 물결표 금지.
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
  const color = all.match(/보라|주황|오렌지색|노란|분홍|핑크|빨간/g); if (color) p.push("색깔 표현: " + [...new Set(color)].join(","));
  const bl = (all.match(/블로거 [a-z0-9_-]{4} 님/g) ?? []).length; if (bl < 10) p.push(`후기 소개 ${bl}명`);
  if (!all.includes(LINK1) || !all.includes(LINK2)) p.push("링크 문단 누락");
  const ban = all.match(/소비기한|유통기한|2027|기관지|감기|기침|콧물|비염|면역|효과|효능|치료|예방|에너지 생성|대사|SSG|76%|중탕|하루에 한 포|하루 한 포|목이 |목 건강|칼칼/g);
  if (ban) p.push("금지 표현: " + [...new Set(ban)].join(","));
  if (d.sections.some((s) => s.type === "image" && s.caption && String(s.caption).trim())) p.push("사진 설명(caption)이 있음");
  if ((all.match(/루솔 진한 배도라지즙 비타플러스/g) ?? []).length > 2) p.push("제품 정식 이름이 너무 많음");
  if (!d.title.trimStart().startsWith(KW)) p.push("제목이 키워드로 시작하지 않음");
  const hs = d.sections.map((s, i) => ((s.type === "heading" || s.type === "quote") && /마무리/.test((s as { text: string }).text) ? i : -1)).filter((i) => i >= 0);
  if (hs.length && d.sections.slice(hs[0] + 1).some((s) => s.type === "heading" || s.type === "quote")) p.push("마무리 뒤에 소제목이 있음");
  if (d.sections.some((s) => s.type === "paragraph" && /^[^:]{1,10} : .*～$/.test(s.text))) p.push("정보 줄 끝에 물결표");
  return { chars, kw, imgs, p };
}

let best: Draft | null = null, fb = "";
for (let a = 1; a <= 4 && !best; a++) {
  const r = await runClaudeJson(`[사용자 원고]\n${userDraft}\n\n${facts}\n\n${RULES}${fb}\n\n${SECTION_FORMAT}`, DraftBaseSchema);
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
