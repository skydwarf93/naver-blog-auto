import fs from "node:fs";
import { naverContext } from "@/lib/playwright";
import { paths } from "@/lib/paths";
import { NAVER } from "@/lib/scrape/selectors";

// 2-4: 로그인은 자동화하지 않는다(보안문자·2차인증). 창을 띄워 사용자가 직접 한다.
let loginInFlight = false;

export async function loginInteractive(): Promise<{ ok: boolean; message: string }> {
  if (loginInFlight) return { ok: false, message: "이미 로그인 창이 열려 있습니다" };
  loginInFlight = true;
  let browser: Awaited<ReturnType<typeof naverContext>>["browser"] | null = null;
  try {
    const opened = await naverContext(false);
    browser = opened.browser;
    const context = opened.context;
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto(NAVER.loginUrl);
    const deadline = Date.now() + 5 * 60 * 1000;
    while (Date.now() < deadline) {
      if (page.isClosed()) return { ok: false, message: "로그인 창이 닫혔습니다" };
      const cookies = await context.cookies();
      if (cookies.some((c) => c.name === "NID_SES")) {
        await page.goto("https://www.naver.com").catch(() => {}); // 쿠키 안정화
        await page.waitForTimeout(1500);
        await context.storageState({ path: paths.session });
        invalidateSessionCache();
        const ses = (await context.cookies()).find((c) => c.name === "NID_SES");
        // ⚠️ 7-10: 만료시각이 없는 세션 쿠키 = "로그인 상태 유지" 를 안 켠 것 → 나중에 글쓰기만 만료된다
        const persistent = ses ? ses.expires > 0 : false;
        return {
          ok: true,
          message: persistent ? "로그인했습니다" : "로그인했지만 '로그인 상태 유지' 가 꺼져 있어 곧 풀릴 수 있습니다",
        };
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    return { ok: false, message: "5분 안에 로그인이 끝나지 않았습니다" };
  } catch (e) {
    const msg = (e as Error).message;
    if (/display|headed|XServer/i.test(msg)) return { ok: false, message: "이 컴퓨터에서는 로그인 창을 띄울 수 없습니다(화면이 없는 환경)" };
    return { ok: false, message: msg.split("\n")[0].slice(0, 200) };
  } finally {
    loginInFlight = false;
    await browser?.close().catch(() => {});
  }
}

export interface SessionStatus { valid: boolean; blogId?: string; reason?: string; checkedAt: number }
let cache: SessionStatus | null = null;
const TTL = 5 * 60 * 1000;
export function invalidateSessionCache() { cache = null; }

export function logout() {
  try { fs.unlinkSync(paths.session); } catch { /* 없음 */ }
  try { fs.rmSync(paths.naverProfile, { recursive: true, force: true }); } catch { /* 없음 */ }
  invalidateSessionCache();
}

export async function verifySession(): Promise<SessionStatus> {
  if (cache && Date.now() - cache.checkedAt < TTL) return cache;
  if (!fs.existsSync(paths.session)) return (cache = { valid: false, reason: "로그인 기록 없음", checkedAt: Date.now() });
  const { browser, context } = await naverContext(true);
  try {
    const page = await context.newPage();
    // ⚠️ 7-9: naver.com 의 nidlogin 링크는 로그인 상태에서도 남아 있다 → 튕기는지로 판정
    await page.goto(NAVER.myBlog, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(1500);
    if (/nid\.naver\.com/.test(page.url())) return (cache = { valid: false, reason: "로그인 만료", checkedAt: Date.now() });
    const m = page.url().match(/blog\.naver\.com\/([A-Za-z0-9_-]+)/);
    let blogId = m && m[1] !== "MyBlog.naver" ? m[1] : undefined;
    if (!blogId) {
      blogId = await page.evaluate(() => {
        const a = [...document.querySelectorAll("a[href*='blog.naver.com/']")].map((x) => (x as HTMLAnchorElement).href);
        for (const h of a) { const mm = h.match(/blog\.naver\.com\/([A-Za-z0-9_-]+)/); if (mm && !/\.naver$/.test(mm[1])) return mm[1]; }
        return undefined;
      });
    }
    if (!blogId) return (cache = { valid: false, reason: "블로그 주소를 찾지 못했습니다", checkedAt: Date.now() });
    // ⚠️ 7-10: 읽기는 되는데 글쓰기만 만료된 상태가 있다 → 글쓰기 페이지까지 열어본다
    await page.goto(NAVER.writeUrl(blogId), { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2000);
    if (/nid\.naver\.com/.test(page.url())) return (cache = { valid: false, blogId, reason: "글쓰기 권한 만료", checkedAt: Date.now() });
    return (cache = { valid: true, blogId, checkedAt: Date.now() });
  } catch (e) {
    return { valid: false, reason: "확인 실패: " + (e as Error).message.slice(0, 120), checkedAt: Date.now() };
  } finally {
    await browser.close().catch(() => {});
  }
}
