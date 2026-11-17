export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  const db = getDb();
  const job = db.prepare("SELECT * FROM jobs WHERE id=?").get(id);
  if (!job) return NextResponse.json({ error: "없는 작업" }, { status: 404 });
  const ideas = db.prepare("SELECT * FROM ideas WHERE job_id=? ORDER BY id").all(id);
  const sources = db.prepare("SELECT id, type, title, url FROM sources WHERE job_id=? ORDER BY id").all(id);
  const draft = db.prepare("SELECT * FROM drafts WHERE job_id=? ORDER BY id DESC LIMIT 1").get(id) as { body_json: string } | undefined;
  const images = db.prepare("SELECT * FROM images WHERE job_id=? ORDER BY section_index, id").all(id);
  const post = db.prepare("SELECT * FROM posts WHERE job_id=? ORDER BY id DESC LIMIT 1").get(id);
  const logs = db.prepare("SELECT id, level, message, created_at FROM job_logs WHERE job_id=? ORDER BY id").all(id);
  return NextResponse.json({ job, ideas, sources, draft: draft ? { ...draft, sections: JSON.parse(draft.body_json) } : null, images, post, logs });
}
