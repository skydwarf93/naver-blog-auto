import { spawn } from "node:child_process";
import fs from "node:fs";
import { chromium, type Browser, type BrowserContext } from "playwright";
import { paths } from "@/lib/paths";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// 설치 Promise 를 모듈 레벨에 캐싱해 중복 설치를 막는다
let installing: Promise<void> | null = null;
function installChromium(): Promise<void> {
  if (!installing) {
    installing = new Promise<void>((resolve, reject) => {
      const p = spawn("npx", ["playwright", "install", "chromium"], { shell: process.platform === "win32", stdio: "inherit" });
      p.on("close", (c) => (c === 0 ? resolve(undefined) : reject(new Error(`chromium 설치 실패(${c})`))));
      p.on("error", reject);
    }).finally(() => { installing = null; }) as Promise<void>;
  }
  return installing;
}

export async function launch(headless: boolean): Promise<Browser> {
  const opts = { headless, args: ["--lang=ko-KR"] };
  try {
    return await chromium.launch(opts);
  } catch (e) {
    if (/Executable doesn'?t exist|please run|install/i.test(String((e as Error).message))) {
      await installChromium();
      return await chromium.launch(opts);
    }
    throw e;
  }
}

export async function newContext(opts: { headless: boolean; useNaverSession?: boolean }): Promise<{ browser: Browser; context: BrowserContext }> {
  const browser = await launch(opts.headless);
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    locale: "ko-KR",
    userAgent: UA,
    storageState: opts.useNaverSession && fs.existsSync(paths.session) ? paths.session : undefined,
  });
  return { browser, context };
}
