import { getDb } from "@/lib/db";

export type LogLevel = "info" | "warn" | "error" | "ok";
export function jobLog(jobId: number, message: string, level: LogLevel = "info") {
  getDb().prepare("INSERT INTO job_logs (job_id, level, message) VALUES (?, ?, ?)").run(jobId, level, message);
  if (process.env.LOG_STDOUT) console.log(`[job ${jobId}] ${level}: ${message}`);
}

export function setJobStage(jobId: number, status: string, stage?: string, error?: string) {
  getDb()
    .prepare("UPDATE jobs SET status=?, stage=?, error=COALESCE(?, error), updated_at=datetime('now') WHERE id=?")
    .run(status, stage ?? status, error ?? null, jobId);
}
