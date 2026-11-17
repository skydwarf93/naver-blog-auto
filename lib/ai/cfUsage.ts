import { config, hasCloudflare } from "@/config";
import { getDb } from "@/lib/db";

/** 오늘 뉴런 사용량. Account Analytics: Read 권한이 있으면 실측, 없으면 자체 생성 로그로 추정 */
export async function getNeuronUsage(): Promise<{ used: number; measured: boolean; note?: string }> {
  const est = (getDb()
    .prepare("SELECT COALESCE(SUM(neurons),0) AS n FROM neuron_log WHERE date(created_at,'localtime') = date('now','localtime')")
    .get() as { n: number }).n;
  if (!hasCloudflare()) return { used: est, measured: false, note: "키 없음" };
  try {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const query = `query($a:String!,$s:Time!,$e:Time!){viewer{accounts(filter:{accountTag:$a}){aiInferenceAdaptiveGroups(limit:100,filter:{datetime_geq:$s,datetime_leq:$e}){sum{totalNeurons}}}}}`;
    const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.cfApiToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables: { a: config.cfAccountId, s: start.toISOString(), e: now.toISOString() } }),
      signal: AbortSignal.timeout(10000),
    });
    const j = (await res.json()) as {
      errors?: Array<{ message: string }>;
      data?: { viewer?: { accounts?: Array<{ aiInferenceAdaptiveGroups?: Array<{ sum?: { totalNeurons?: number } }> }> } };
    };
    // ⚠️ 7-12: 권한이 없으면 401 이 아니라 "not authorized" GraphQL 에러로 온다
    if (j.errors?.length) return { used: est, measured: false, note: "추정치(토큰에 분석 권한 없음)" };
    const groups = j.data?.viewer?.accounts?.[0]?.aiInferenceAdaptiveGroups ?? [];
    return { used: groups.reduce((a, g) => a + (g.sum?.totalNeurons ?? 0), 0), measured: true };
  } catch {
    return { used: est, measured: false, note: "추정치" };
  }
}
