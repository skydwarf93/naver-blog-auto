import Database from "better-sqlite3";
import { paths } from "@/lib/paths";

type DB = Database.Database;
// ⚠️ 7-17: Next dev 의 HMR 이 모듈을 여러 번 평가한다 → globalThis 에 캐싱하지 않으면 커넥션이 쌓인다
const g = globalThis as unknown as { __blogDb?: DB };

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, keyword TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
  stage TEXT, auto INTEGER NOT NULL DEFAULT 1, mode TEXT NOT NULL DEFAULT 'auto', inputs TEXT, error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER NOT NULL, type TEXT NOT NULL, title TEXT, summary TEXT,
  url TEXT, content TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS ideas (
  id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER NOT NULL, title TEXT, angle TEXT, rationale TEXT,
  chosen INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS drafts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER NOT NULL, idea_id INTEGER, title TEXT, body_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS images (
  id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER NOT NULL, draft_id INTEGER, query TEXT, src_url TEXT,
  local_path TEXT, source_site TEXT, verdict_ok INTEGER, verdict_reason TEXT, section_index INTEGER,
  gen_prompt TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER NOT NULL, draft_id INTEGER, status TEXT NOT NULL,
  blog_url TEXT, screenshot TEXT, note TEXT, published_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS job_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER NOT NULL, level TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS neuron_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, job_id INTEGER, steps INTEGER, neurons REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS idx_logs_job ON job_logs(job_id, id);
`;

// 기존 DB 를 날리지 않고 컬럼만 추가하는 마이그레이션
const MIGRATIONS: Array<[table: string, column: string, ddl: string]> = [
  ["jobs", "mode", "ALTER TABLE jobs ADD COLUMN mode TEXT NOT NULL DEFAULT 'auto'"],
  ["jobs", "inputs", "ALTER TABLE jobs ADD COLUMN inputs TEXT"],
  ["images", "gen_prompt", "ALTER TABLE images ADD COLUMN gen_prompt TEXT"],
  ["images", "section_index", "ALTER TABLE images ADD COLUMN section_index INTEGER"],
];

export function getDb(): DB {
  if (g.__blogDb) return g.__blogDb;
  const db = new Database(paths.db);
  db.pragma("journal_mode = WAL"); // SSE 폴링과 쓰기가 동시에 일어난다
  db.pragma("busy_timeout = 5000");
  db.exec(SCHEMA);
  for (const [t, c, ddl] of MIGRATIONS) {
    const cols = db.prepare(`PRAGMA table_info(${t})`).all() as Array<{ name: string }>;
    if (!cols.some((x) => x.name === c)) db.exec(ddl);
  }
  g.__blogDb = db;
  return db;
}
