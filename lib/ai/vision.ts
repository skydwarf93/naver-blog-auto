import { runClaudeJson } from "@/lib/claude";
import { GenVerdictSchema, VisionVerdictSchema, type VisionVerdict } from "@/lib/types";

/** 크롤링 사진 판정 — 세 축을 따로 묻는다 */
export async function judgeCrawled(imagePath: string, topic: string, placement: string): Promise<VisionVerdict> {
  const prompt = `블로그 글 "${topic}" 의 "${placement}" 자리에 넣을 사진 후보다. 첨부 이미지를 직접 보고 판정하라.
- watermark: 워터마크/사이트 로고/저작권 표기/서명/스톡 출처표시가 조금이라도 보이면 true. 의심스러우면 true.
- koreanPerson: 한국인 얼굴이 식별 가능하면 true(초상권 위험). 얼굴이 안 보이거나(뒷모습·손·실루엣) 명백한 외국인 스톡이면 false. 애매하면 true.
- fit: 위 둘이 문제없다는 전제에서 주제·위치에 어울리면 true.
- reason: 한 줄 이유.
출력: {"fit":bool,"watermark":bool,"koreanPerson":bool,"reason":"..."}`;
  const r = await runClaudeJson(prompt, VisionVerdictSchema, { images: [imagePath], retries: 1 });
  // ⚠️ 판정 호출 실패 = 검증 안 된 이미지. 채택하지 않는다(claude 한도 초과가 "통과"로 이어지면 안 된다)
  if (!r.ok) return { fit: false, watermark: false, koreanPerson: false, reason: "판정 실패: " + r.error.slice(0, 120) };
  const v = r.data;
  // AI 가 fit=true 라고 해도 워터마크·국내 인물이면 강제 탈락
  if (v.watermark || v.koreanPerson) v.fit = false;
  return v;
}

export function verdictLabel(v: VisionVerdict): string {
  if (v.reason.startsWith("판정 실패")) return v.reason;
  if (v.watermark) return "워터마크: " + v.reason;
  if (v.koreanPerson) return "국내 인물(초상권): " + v.reason;
  if (!v.fit) return "주제 불일치: " + v.reason;
  return "채택: " + v.reason;
}

/** ⚠️ 7-13: 생성 이미지 판정은 별도. 생성물엔 워터마크·초상권이 없다 — 크롤링 판정을 쓰면 멀쩡한 이미지가 탈락한다 */
export async function judgeGenerated(imagePath: string, scene: string) {
  const prompt = `AI 로 생성한 이미지다. 의도한 장면: "${scene}"
첨부 이미지를 보고 아래 네 가지만 확인하라.
- off_topic: 의도한 장면과 다르다
- broken_shape: 손가락·사물 형태가 깨졌다
- text_in_image: 글자·숫자·깨진 문자가 들어 있다(아주 작은 것도)
- low_quality: 흐리거나 조잡하다
문제가 없으면 ok=true, problem="none".
출력: {"ok":bool,"problem":"none|off_topic|broken_shape|text_in_image|low_quality","reason":"..."}`;
  const r = await runClaudeJson(prompt, GenVerdictSchema, { images: [imagePath], retries: 1 });
  if (!r.ok) return { ok: false, problem: "low_quality" as const, reason: "판정 실패: " + r.error.slice(0, 120) };
  if (r.data.problem !== "none") r.data.ok = false;
  return r.data;
}
