// 사용자 원고(정보형) 기반 재작성 → 조건 검사 → post/post.json 저장. 발행하지 않는다.
import fs from "node:fs";
import { z } from "zod";
import { runClaudeJson } from "@/lib/claude";
import { DraftBaseSchema, type Draft } from "@/lib/types";
import { SECTION_FORMAT } from "@/lib/ai/templates";
import { sanitizeDraft } from "@/lib/ai/content";

const URL = "https://brand.naver.com/labonlab/products/12280125608";
const LINK1 = `👉 네이버 공식 브랜드스토어 구매 링크: ${URL}`;
const LINK2 = `구매 링크 한 번 더 남겨둘게요 👉 ${URL}`;
const PHOTOS: Record<string, { file: string; desc: string }> = {
  "사진1": { file: "photo01.jpg", desc: "제품 상자 앞면(제품명, 미오이노시톨 4,000mg 등 함량, HACCP 마크)" },
  "사진2": { file: "photo02.jpg", desc: "상자에서 스틱을 꺼낸 모습(개별 스틱 포장)" },
  "사진3": { file: "photo03.webp", desc: "상자 안에 스틱 30포가 세워져 가득 들어 있는 모습" },
  "사진4": { file: "photo04.jpg", desc: "상자 측면 원재료 및 함량 표시" },
  "사진5": { file: "photo05.jpg", desc: "상자 측면 주의사항·제조원·소비기한 표기" },
};
const userDraft = fs.readFileSync(process.argv[2], "utf8");

const facts = `[제품 실물 사진에서 확인한 사실 — 이 범위 밖의 제품 사실은 지어내지 말 것]
- 제품명: 미오이노시톨 콜린&알파 4000, 브랜드 랩온랩(LAB ON LAB)
- 앞면: 미오이노시톨 4,000mg / 콜린 5mg / 엽산 / 비오틴 / 비타민C / 질유래유산균, 135g(4.5g x 30포), HACCP 인증 마크
- 식품유형: 기타가공품 (건강기능식품 아님)
- 원재료: 이노시톨(인도산) 88.89%, 자일리톨(핀란드산) 2.5%, 비타민C(영국산) 2.3%, 석류농축분말(튀르키예산) 2.13%, 석류향분말, 크랜베리농축분말, 레몬껍질추출물분말(엽산 5%), 효소처리스테비아, 주석산수소콜린(이탈리아산) 0.12%, 산화아연, 10종혼합유산균, 알파-시클로덱스트린(미국산), 비오틴(프랑스산). 우유·대두 포함
- 제품명의 "알파" 와 관련해 원재료표에 알파-시클로덱스트린(미국산)이 적혀 있음(무슨 역할인지는 쓰지 말고 표기 사실만)
- 섭취방법: 1일 1회, 1회 1포를 물과 함께 / 보관: 습기가 적고 직사광선을 받지 않는 실온
- 주의사항: 특이체질·알레르기체질·임신·수유부·질병 치료 중인 분은 원료 확인 후 섭취
- 스틱마다 쉽게 자를 수 있는 점선(절취선)이 있어 가위 없이 손으로 뜯을 수 있음 → 가방·파우치에 넣어 다니다 언제든 간편하게 챙겨 먹기 좋음
- 제조원 ㈜제이에스바이오, 유통전문판매원 ㈜랩온랩, 소비기한 2028.07.12
[네이버 블로그에서 모은 구매자 후기 10개 — 요약본]
1. 블로거 ohdd 님: 후기가 좋아서 4개 세트로 샀고, 주문 이틀 만에 도착했다고 함
2. 블로거 ghdr 님: 500mg 정제 8알 분량을 한 포에 담아 하루 스틱 하나만 챙기면 돼서 간편하다고 함
3. 블로거 hari 님: 먹던 알약 대신 한 포로 해결되고 원료 원산지 표기가 있어 믿음이 갔다고 함, 새콤달콤한 석류맛이라고 함
4. 블로거 wlgm 님: 영양제 특유의 쓴맛이 없고 상큼한 석류맛이라 챙기기 좋고, 스틱형이라 보관이 간편하다고 함
5. 블로거 rnlt 님: 심플한 패키지 디자인이 마음에 들었고, 디저트처럼 챙기게 되는 맛이라고 함
6. 블로거 gusd 님: 큰 알약이 아니라 4.5g 분말 스틱이라 목 넘김 부담이 없다고 함
7. 블로거 dipo 님: 가족을 위해 골랐는데 입안에서 부드럽게 녹아 알약 거부감이 없었다고 함
8. 블로거 tntk 님: 매일 아침 식사 직후 1포씩 먹는 루틴으로 챙겼다고 함
9. 블로거 thdm 님: 올리브영에도 입점했고 한 박스 30포라 한 달 루틴 잡기 좋다고 함
10. 블로거 dmsg 님: 패키지가 깔끔하다고 함`;

const RULES = `[작성 규칙 — 반드시 지킬 것]
A. 아래 [사용자 원고] 의 구성(서론 → 1~5번 구획 → 마무리)과 정보형 흐름, 각 구획 첫머리의 짧은 후킹 문장을 살려서 다시 써라.
   1~5번 구획 제목은 heading 섹션으로, 후킹 문장은 그 바로 다음 paragraph 로. "후킹 :" 같은 표시는 쓰지 마라.
   1번의 제품 기본 정보는 "제품명 : …" 처럼 한 줄씩 짧은 문단으로(목록 기호 금지).
B. 제품 사실은 [제품 실물 사진에서 확인한 사실] 로 바로잡아라. 특히 함량은 포장에 4,000mg 이라고 적혀 있고, 알파는 원재료표에 알파-시클로덱스트린으로 적혀 있다.
C. ⚠️ 기타가공품이다. 다낭성·PCOS·생리(주기·불순)·임신 준비·난임·난소·인슐린·혈당·간 기능·다이어트 같은 질병·신체기능 이야기, "효능", "효과" 라는 단어를 쓰지 마라.
   3번 구획은 "평소 영양 관리를 꾸준히 하고 싶은 분 / 알약 삼키기 힘든 분 / 외출이 잦아 휴대 간편한 제품을 찾는 분 / 원산지 표기를 꼼꼼히 보는 분" 으로 써라.
   성분 설명은 "콜린은 우리 몸에 필요한 영양소 중 하나" 정도의 일반 정보까지만.
D. 쿠팡·상품평 개수·포장 불량 사례는 쓰지 마라. 5번 구획의 확인 포인트 5가지(섭취 편의성/맛과 향/포장 상태/배송과 소비기한/재구매)는 위 네이버 후기 10개를
   "블로거 ○○ 님은 ~라고 하시더라구요" 식으로 각 포인트에 나눠 소개하며 설명하라(10명 모두 한 번씩, 블로거 표기는 위에 적힌 그대로). 맛 이야기는 후기로만.
E. 색깔 표현(분홍·핑크·보라 등 색 이름)을 절대 쓰지 마라.
F. 점선(절취선) 덕분에 가위 없이 뜯어 휴대하며 언제든 챙겨 먹기 쉽다는 내용을 1번 구획에 꼭 넣어라.
G. 핵심 키워드는 "이노시톨". "이노시톨" 글자는 제목+본문+사진설명 전체에서 "미오이노시톨"·제품명 안에 든 것까지 모두 합쳐 정확히 6~9번만.
   제목 앞부분에 포함. 그 밖에서는 "이 제품", "랩온랩 제품", "스틱", "주성분" 등으로 바꿔 불러라. 해시태그에도 이노시톨 글자를 쓰지 마라.
H. image 섹션 정확히 5개. query 는 "사진1"~"사진5" 중 하나를 그대로(각 1번씩). 사진 사이에 문단 2개 이상, 첫 사진 앞에 문단 2개 이상.
   사진 내용: ${Object.entries(PHOTOS).map(([k, v]) => `${k}=${v.desc}`).join(" / ")}. 내용에 맞는 구획에 배치하고 caption 을 달아라.
I. 다음 두 문단을 글자 그대로 넣어라: ① 5번 구획 끝: "${LINK1}" ② 마무리의 마지막 안내 문단 바로 앞: "${LINK2}"
J. 마지막 문단: "임신·수유 중이거나 질병 치료 중이라면 전문가와 상담 후 드세요" 취지 + 그 다음 해시태그 문단 1개(#랩온랩 #콜린 #스틱영양제 등 5~8개, 질병·임신 관련 태그 금지).
K. 말투: "~이에요～", "~더라구요～", "~거든요", "~답니다" 같은 부드러운 어미를 섞되 문단당 1~2번. 물결표는 전각 '～' 만.
L. 공백 제외 1500자 이상. 가격 쓰지 마라.`;

function check(d: Draft) {
  const all = [d.title, ...d.sections.map((s) => ("text" in s ? s.text : "") + ("caption" in s && s.caption ? " " + s.caption : ""))].join("\n");
  const body = d.sections.map((s) => ("text" in s ? s.text : "")).join("");
  const p: string[] = [];
  const chars = body.replace(/\s/g, "").length;
  const kw = all.split("이노시톨").length - 1;
  const imgs = d.sections.map((s, i) => (s.type === "image" ? i : -1)).filter((i) => i >= 0);
  const qs = d.sections.filter((s) => s.type === "image").map((s) => (s as { query: string }).query.trim());
  if (chars < 1200) p.push(`본문 ${chars}자`);
  if (kw < 3 || kw > 10) p.push(`"이노시톨" ${kw}회(3~10회여야 함, 미오이노시톨 포함)`);
  if (!d.title.includes("이노시톨")) p.push("제목에 이노시톨 없음");
  if (imgs.length !== 5 || new Set(qs).size !== 5 || !qs.every((q) => q in PHOTOS)) p.push(`사진 query 오류 ${JSON.stringify(qs)}`);
  if (imgs[0] < 2 || imgs.slice(1).some((v, i) => v - imgs[i] < 3)) p.push("사진 간격 부족");
  const color = all.match(/분홍|핑크|보라|퍼플|pink/gi); if (color) p.push("색깔 표현: " + [...new Set(color)].join(","));
  if (!/점선|절취선/.test(all)) p.push("점선 문구 없음");
  const bl = (all.match(/블로거 [a-z]{4} 님/g) ?? []).length; if (bl < 10) p.push(`후기 소개 ${bl}명`);
  if (!all.includes(LINK1) || !all.includes(LINK2)) p.push("구매 링크 문단 누락");
  const ban = all.match(/다낭성|PCOS|생리|임신 준비|임신준비|난임|난소|인슐린|혈당|간 기능|다이어트|효능|효과|쿠팡|상품평/g); if (ban) p.push("금지 표현: " + [...new Set(ban)].join(","));
  return { chars, kw, imgs, p };
}

let best: Draft | null = null, fb = "";
for (let a = 1; a <= 4 && !best; a++) {
  const r = await runClaudeJson(`[사용자 원고]\n${userDraft}\n\n${facts}\n\n${RULES}${fb}\n\n${SECTION_FORMAT}`, DraftBaseSchema);
  if (!r.ok) { console.log("생성 실패", r.error.slice(0, 200)); continue; }
  const { draft } = sanitizeDraft(r.data);
  const c = check(draft);
  console.log(`${a}차: 본문 ${c.chars}자, 이노시톨 ${c.kw}회, 사진 위치 ${c.imgs.join(",")} → ${c.p.length ? "문제: " + c.p.join(" / ") : "통과"}`);
  if (!c.p.length) best = draft; else fb = `\n\n[이전 원고의 문제 — 반드시 고칠 것]: ${c.p.join(" / ")}`;
}
if (!best) process.exit(1);
const images: Record<string, string> = {};
best.sections.forEach((s, i) => { if (s.type === "image") images[String(i)] = PHOTOS[s.query.trim()].file; });
fs.writeFileSync("post/post.json", JSON.stringify({ title: best.title, sections: best.sections, images, headingAsQuote: true }, null, 2));
console.log("저장: post/post.json", images);
