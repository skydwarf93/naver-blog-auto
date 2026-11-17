import type { PhotoSource } from "@/lib/types";

const NO_MARKDOWN =
  "마크다운 기호(**, ~~, ~, #, >, 백틱, - 목록)를 절대 쓰지 마라. 서식은 섹션 type 으로만 표현한다. 물결표(~)도 쓰지 마라.";

export const SECTION_FORMAT = `출력 형식(JSON 객체):
{"title": "글 제목", "sections": [ 섹션, ... ]}
섹션 종류:
- {"type":"heading","text":"소제목"}
- {"type":"paragraph","text":"문단","highlight":"(선택) text 안에 글자 그대로 들어 있는 핵심 구절"}
- {"type":"quote","text":"짧은 한 줄"}
- {"type":"divider"}
- {"type":"image","query":"...","caption":"사진 아래 설명(선택)"}
highlight 규칙: 문단당 최대 1개, 전체 문단의 30% 정도에만. 반드시 그 문단 text 에 한 글자도 다르지 않게 들어 있는 구절이어야 한다.
${NO_MARKDOWN}`;

export function photoHintFor(photoSource: PhotoSource, count: number, descs?: string[]): string {
  switch (photoSource) {
    case "none":
      return "사진은 쓰지 않는다. image 섹션을 하나도 만들지 마라.";
    case "local":
      return `사용자가 직접 찍은 사진 ${count}장을 쓴다. image 섹션을 정확히 ${count}개 만들어라.
image 의 query 에는 검색어가 아니라 "그 자리에 어떤 사진이 와야 하는지 설명"을 써라.
사용 가능한 사진 목록:
${(descs ?? []).map((d, i) => `${i + 1}. ${d}`).join("\n")}`;
    case "ai":
      return `사진은 AI 가 그린다. image 섹션을 6~8개 만들어라(일부는 실패하므로 넉넉히).
image 의 query 에는 "어떤 장면을 그려야 하는지" 한국어로 구체적으로 묘사하라. 사람 얼굴이 주인공이 아닌 장면(사물·풍경·손동작·뒷모습).`;
    case "crawl":
    default:
      return `사진은 검색해서 가져온다. image 섹션을 6~8개 만들어라(일부는 적합 사진을 못 찾으므로 넉넉히).
image 의 query 에는 이미지 검색어를 써라. 사람 얼굴이 주인공이 아닌 사물·풍경·클로즈업·손동작 위주.`;
  }
}

export function reviewPrompt(topic: string, details: string, photoHint: string) {
  return `너는 네이버 블로그 체험단 후기 작가다. 아래 주제로 방문/사용 후기를 써라.

주제: ${topic}
핵심 내용(사용자가 준 사실 — 이 범위를 벗어난 사실을 지어내지 마라):
${details || "(없음)"}

문체:
- 철저히 1인칭("저희는", "~했어요", "~더라구요"). "ㅎㅎ", "진짜" 같은 표현을 자연스럽게.
- AI 티 나는 표현(예: "결론적으로", "다양한", "~할 수 있습니다" 남발) 금지.
- 문단은 2~4줄로 짧게.
구조:
- 도입에서 결론을 살짝 흘린다.
- 소제목은 heading 이 아니라 quote 로 만든다(15~30자 짧은 한 줄).
- 실용정보를 구획별로: 가는 법 / 웨이팅 / 가격 / 언제 갈지 / 주의점 (주어진 내용 안에서).
- 문단 1~2개마다 사진 1장 리듬.
- 마무리는 총평 + 다시 간다면의 팁.

${photoHint}

${SECTION_FORMAT}`;
}

export function brandingPrompt(topic: string, details: string, photoHint: string) {
  return `너는 네이버 블로그에 전문성 칼럼을 쓰는 전문가다. 아래 주제로 브랜딩 글을 써라.

주제: ${topic}
핵심 내용(사용자가 준 사실):
${details || "(없음)"}

문체: "~입니다" 전문가체. AI 티 나는 표현 금지. 문단은 2~4줄로 짧게.
⚠️ 숫자·실적을 지어내지 마라. 사용자가 준 내용 안에 있는 숫자만 쓴다. 없으면 숫자 없이 쓴다.
구조(고정):
① 권위 선점(사용자가 준 실적 숫자) ② 독자의 문제/오해 짚기 ③ 왜 그 방법이 안 통하는지
④ 이름 붙인 자체 프레임워크(예: "3단계 ○○ 법") ⑤ 예상 반박 Q&A ⑥ 정리 + 행동 유도
- 소제목은 heading 이 아니라 quote 로 만든다(15~30자 짧은 한 줄).
- 구획 전환에 divider 를 1~2회.

${photoHint}

${SECTION_FORMAT}`;
}
