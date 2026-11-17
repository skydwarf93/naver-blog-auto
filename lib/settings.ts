import { getDb } from "@/lib/db";
import { config } from "@/config";

export type Visibility = "public" | "neighbor" | "both" | "private";
export interface Settings {
  dryRun: boolean;
  killSwitch: boolean;
  visibility: Visibility;
  dailyPublishLimit: number;
  minPublishIntervalMin: number;
  scrapeTopN: number;
  imageCandidates: number;
  cfImageSteps: number;
  showBrowser: boolean;
  claudeTimeoutSec: number;
  claudeConcurrency: number;
}

export const LIMITS = {
  dailyPublishLimit: [1, 50],
  minPublishIntervalMin: [0, 720],
  scrapeTopN: [3, 30],
  imageCandidates: [3, 20],
  cfImageSteps: [1, 8],
  claudeTimeoutSec: [30, 900],
  claudeConcurrency: [1, 6],
} as const satisfies Partial<Record<keyof Settings, readonly [number, number]>>;

export const VISIBILITIES: Visibility[] = ["public", "neighbor", "both", "private"];
const BOOL_KEYS = ["dryRun", "killSwitch", "showBrowser"] as const;

export const DEFAULTS: Settings = { ...config.defaults } as Settings;

function clampNum(key: keyof typeof LIMITS, v: unknown): number {
  const [lo, hi] = LIMITS[key];
  let n = Math.round(Number(v));
  if (!Number.isFinite(n)) n = DEFAULTS[key] as number;
  return Math.min(hi, Math.max(lo, n));
}

/** 값을 규칙에 맞게 보정한다. 알 수 없는 키면 throw */
export function normalize(key: string, value: unknown): [keyof Settings, Settings[keyof Settings]] {
  if ((BOOL_KEYS as readonly string[]).includes(key)) return [key as keyof Settings, value === true || value === "true" || value === 1];
  if (key === "visibility") {
    // 알 수 없는 값은 가장 안전한 비공개로
    return ["visibility", VISIBILITIES.includes(value as Visibility) ? (value as Visibility) : "private"];
  }
  if (key in LIMITS) return [key as keyof Settings, clampNum(key as keyof typeof LIMITS, value)];
  throw new Error(`알 수 없는 설정: ${key}`);
}

export function getSettings(): Settings {
  const rows = getDb().prepare("SELECT key, value FROM settings").all() as Array<{ key: string; value: string }>;
  const s: Settings = { ...DEFAULTS };
  for (const r of rows) {
    try {
      const [k, v] = normalize(r.key, JSON.parse(r.value));
      (s as unknown as Record<string, unknown>)[k] = v;
    } catch {
      /* 옛 키는 무시 */
    }
  }
  return s;
}

export function updateSettings(patch: Record<string, unknown>): Settings {
  const db = getDb();
  const entries = Object.entries(patch).map(([k, v]) => normalize(k, v)); // 하나라도 모르는 키면 전체 거절
  const stmt = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value");
  db.transaction(() => entries.forEach(([k, v]) => stmt.run(k, JSON.stringify(v))))();
  return getSettings();
}

export function resetSettings(): Settings {
  getDb().exec("DELETE FROM settings");
  return getSettings();
}
