import { runClaudeJson } from "@/lib/claude";
import { IdeasSchema, draftSchemaFor, type Draft, type Idea, type PhotoSource, type Source } from "@/lib/types";
import { SECTION_FORMAT, brandingPrompt, photoHintFor, reviewPrompt } from "@/lib/ai/templates";

function sourceBlock(sources: Source[]) {
  return sources
    .map((s, i) => `[${i + 1}] (${s.type === "news" ? "뉴스" : "블로그"}) ${s.title}\n${s.summary}`.slice(0, 400))
    .join("\n\n");
}

export async function generateIdeas(keyword: string, sources: Source[], n = 5) {
  const prompt = `관심 키워드: ${keyword}

아래는 지금 네이버 뉴스·블로그에서 수집한 자료다.
${sourceBlock(sources) || "(수집 자료 없음 — 키워드에 대한 일반적인 관심사를 바탕으로)"}

이 흐름을 읽고, 네이버 블로그에 쓰면 반응이 좋을 글감 ${n}개를 제안하라.
가장 좋은 것을 맨 앞에 둬라.
출력: [{"title":"글 제목","angle":"어떤 관점으로 쓸지","rationale":"왜 지금 이 글감인지(자료 근거)"}]`;
  return runClaudeJson(prompt, IdeasSchema);
}

export async function generateDraft(keyword: string, idea: Idea, sources: Source[], photoSource: PhotoSource) {
  const prompt = `키워드: ${keyword}
글감: ${idea.title}
관점: ${idea.angle}

참고 자료:
${sourceBlock(sources) || "(없음)"}

지시:
- 수집 자료를 참고하되 문장을 그대로 베끼지 마라.
- 사람이 쓴 듯한 구어체. AI 티 나는 표현 금지.
- 도입(공감/후킹) → 본문(heading 소제목 2~4구획) → 마무리(요약/행동유도).
- 문단은 2~4줄로 짧게.

${photoHintFor(photoSource, 0)}

${SECTION_FORMAT}`;
  return runClaudeJson(prompt, draftSchemaFor(photoSource));
}

export async function generateModeDraft(
  mode: "review" | "branding", topic: string, details: string,
  photoSource: PhotoSource, photoCount: number, photoDescs?: string[],
) {
  const hint = photoHintFor(photoSource, photoCount, photoDescs);
  const prompt = mode === "review" ? reviewPrompt(topic, details, hint) : brandingPrompt(topic, details, hint);
  return runClaudeJson(prompt, draftSchemaFor(photoSource, photoCount));
}

// ⚠️ 7-8: 스마트에디터는 입력 중 마크다운을 자동 변환한다. AI 에게 지시하는 것만으로는 부족 → 타이핑 직전 무력화
export function neutralizeMarkdown(text: string): string {
  return text
    .replace(/~+/g, "～") // 전각 물결표(어감 보존)
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, "")
    .replace(/^[ \t]*>[ \t]+/gm, "")
    .replace(/^[ \t]*[-*+][ \t]+/gm, "");
}

/** ⚠️ 7-24: AI 는 본문에 없는 highlight 를 지어낸다(실측 20%). 그 highlight 만 떨어뜨린다 — 초안 전체 재생성은 나쁜 거래 */
export function sanitizeDraft(d: Draft): { draft: Draft; droppedHighlights: number } {
  let dropped = 0;
  const sections = d.sections.map((s) => {
    if (s.type === "paragraph") {
      const text = neutralizeMarkdown(s.text);
      let hl = s.highlight ? neutralizeMarkdown(s.highlight).trim() : undefined;
      if (hl && !text.includes(hl)) { dropped++; hl = undefined; }
      return hl ? { type: "paragraph" as const, text, highlight: hl } : { type: "paragraph" as const, text };
    }
    if (s.type === "heading" || s.type === "quote") return { ...s, text: neutralizeMarkdown(s.text) };
    if (s.type === "image") return { ...s, caption: s.caption ? neutralizeMarkdown(s.caption) : s.caption };
    return s;
  });
  return { draft: { title: neutralizeMarkdown(d.title), sections }, droppedHighlights: dropped };
}
