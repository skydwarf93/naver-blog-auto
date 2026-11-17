// 전역 기본값. 환경변수로 "최초 기본값"만 바꿀 수 있고, 이후엔 DB(settings) 값이 우선한다.
const env = process.env;
const num = (v: string | undefined, d: number) => (v && !Number.isNaN(Number(v)) ? Number(v) : d);
const bool = (v: string | undefined, d: boolean) => (v === undefined || v === "" ? d : v === "1" || v === "true");

export const config = {
  port: 4123,
  claudeBin: env.CLAUDE_BIN || "claude",
  cfAccountId: env.CLOUDFLARE_ACCOUNT_ID || "",
  cfApiToken: env.CLOUDFLARE_API_TOKEN || "",
  cfModel: "@cf/black-forest-labs/flux-1-schnell",
  cfFreeNeuronsPerDay: 10000,
  defaults: {
    dryRun: bool(env.DRY_RUN, true),
    killSwitch: bool(env.KILL_SWITCH, false),
    visibility: (env.VISIBILITY as "public" | "neighbor" | "both" | "private") || "private",
    dailyPublishLimit: num(env.DAILY_PUBLISH_LIMIT, 3),
    minPublishIntervalMin: num(env.MIN_PUBLISH_INTERVAL_MIN, 30),
    scrapeTopN: num(env.SCRAPE_TOP_N, 8),
    imageCandidates: num(env.IMAGE_CANDIDATES, 10),
    cfImageSteps: num(env.CF_IMAGE_STEPS, 6),
    showBrowser: bool(env.SHOW_BROWSER, false),
    claudeTimeoutSec: num(env.CLAUDE_TIMEOUT_SEC, 180),
    claudeConcurrency: num(env.CLAUDE_CONCURRENCY, 2),
  },
  publishStageTimeoutMs: 15 * 60 * 1000,
};

export const hasCloudflare = () => Boolean(config.cfAccountId && config.cfApiToken);
