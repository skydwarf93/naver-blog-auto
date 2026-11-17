export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { getDb } from "@/lib/db";

const DONE = new Set(["done", "failed", "canceled"]);

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  const after = Number(new URL(req.url).searchParams.get("after") || 0);
  const db = getDb();
  const enc = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | null = null;
  const stream = new ReadableStream({
    start(controller) {
      let last = after;
      let lastStage = "";
      const send = (event: string, data: unknown) => controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      const tick = () => {
        try {
          const rows = db.prepare("SELECT id, level, message, created_at FROM job_logs WHERE job_id=? AND id>? ORDER BY id").all(id, last) as Array<{ id: number }>;
          for (const r of rows) { send("log", r); last = r.id; }
          const job = db.prepare("SELECT status, stage FROM jobs WHERE id=?").get(id) as { status: string; stage: string } | undefined;
          const key = job ? job.status + "|" + job.stage : "";
          if (job && key !== lastStage) { send("stage", job); lastStage = key; } // 바뀔 때만
          if (!job || DONE.has(job.status)) { send("end", job ?? {}); if (timer) clearInterval(timer); controller.close(); }
        } catch { if (timer) clearInterval(timer); try { controller.close(); } catch { /* 이미 닫힘 */ } }
      };
      tick();
      timer = setInterval(tick, 1000); // job_logs 1초 폴링
    },
    cancel() { if (timer) clearInterval(timer); },
  });
  req.signal.addEventListener("abort", () => { if (timer) clearInterval(timer); });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}
