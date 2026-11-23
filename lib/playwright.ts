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

/**
 * 네이버 전용: 같은 브라우저 기록(프로필)을 계속 쓴다.
 * 실측(사용자 PC): 매번 빈 브라우저로 로그인하면 네이버가 새 기기로 판단해 비밀번호 변경을 반복 요구했다.
 * 프로필을 유지하면 기기 정보와 쿠키가 남는다. 이전 방식의 저장 쿠키(naver-session.json)도 시작할 때 다시 넣어 준다.
 * 한 번에 하나만 열 수 있다(프로필 잠금) — 로그인·확인·입력은 차례로만 쓴다.
 */
export async function naverContext(headless: boolean): Promise<{ browser: Browser; context: BrowserContext }> {
  fs.mkdirSync(paths.naverProfile, { recursive: true });
  const opts = { headless, viewport: { width: 1366, height: 900 }, locale: "ko-KR", userAgent: UA, args: ["--lang=ko-KR"] };
  let context: BrowserContext;
  try {
    context = await chromium.launchPersistentContext(paths.naverProfile, opts);
  } catch (e) {
    if (!/Executable doesn'?t exist|please run|install/i.test(String((e as Error).message))) throw e;
    await installChromium();
    context = await chromium.launchPersistentContext(paths.naverProfile, opts);
  }
  if (fs.existsSync(paths.session)) {
    try {
      const saved = JSON.parse(fs.readFileSync(paths.session, "utf8")) as { cookies?: Parameters<BrowserContext["addCookies"]>[0] };
      const now = Date.now() / 1000;
      const have = new Set((await context.cookies()).map((c) => `${c.name}@${c.domain}`));
      const restore = (saved.cookies ?? []).filter((c) => !have.has(`${c.name}@${c.domain}`) && (c.expires === -1 || (c.expires ?? -1) > now));
      if (restore.length) await context.addCookies(restore);
    } catch { /* 저장 쿠키가 깨졌으면 무시 */ }
  }
  // 기존 코드가 browser.close()/on("disconnected") 를 쓰므로 같은 모양으로 감싼다
  const browserLike = {
    close: () => context.close(),
    on: (ev: string, cb: () => void) => { if (ev === "disconnected") context.on("close", cb); return browserLike; },
  } as unknown as Browser;
  return { browser: browserLike, context };
}
