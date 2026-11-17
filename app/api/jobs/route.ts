export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { activeJob, createJob, runJob } from "@/lib/pipeline";
import { JobInputSchema } from "@/lib/types";
import { hasCloudflare } from "@/config";

export async function GET() {
  const rows = getDb().prepare(
    "SELECT j.id, j.keyword, j.status, j.stage, j.mode, j.created_at, (SELECT status FROM posts p WHERE p.job_id=j.id ORDER BY id DESC LIMIT 1) AS post_status FROM jobs j ORDER BY j.id DESC LIMIT 30",
  ).all();
  return NextResponse.json({ jobs: rows });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = JobInputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "입력값을 확인해 주세요: " + parsed.error.issues.map((i) => i.path.join(".")).join(", ") }, { status: 400 });
  const input = parsed.data;
  if (input.mode === "auto" && input.photoSource === "local") return NextResponse.json({ error: "자동 발굴에서는 내 사진을 쓸 수 없습니다" }, { status: 400 });
  if (input.photoSource === "local" && !input.photoDir.trim()) return NextResponse.json({ error: "사진 폴더를 골라주세요" }, { status: 400 });
  if (input.photoSource === "ai" && !hasCloudflare()) return NextResponse.json({ error: "AI 사진 생성 열쇠가 없습니다" }, { status: 400 });
  // ⚠️ 7-16: 버튼 연타·SSE 재연결로 같은 잡이 두 번 생긴다 → 진행 중이면 409
  const act = activeJob();
  if (act) return NextResponse.json({ error: "이미 진행 중인 작업이 있습니다", jobId: act.id }, { status: 409 });
  const id = createJob(input);
  runJob(id).catch(console.error); // fire-and-forget. 진행 상황은 SSE 로
  return NextResponse.json({ id });
}
