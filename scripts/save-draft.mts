// 사용법: npm run save-draft
// post/post.json 의 글을 네이버 블로그에 "임시저장" 만 한다. 발행하지 않는다.
import fs from "node:fs";
import path from "node:path";
import { loginInteractive, verifySession, invalidateSessionCache } from "@/lib/naver/session";
import { publishToNaver } from "@/lib/naver/publish";

// 사용법: npm run save-draft -- post-eyeclear  (폴더를 안 주면 post)
const dir = path.resolve(process.argv[2] || "post");
const post = JSON.parse(fs.readFileSync(path.join(dir, "post.json"), "utf8"));
const images: Record<number, string> = {};
for (const [k, f] of Object.entries(post.images as Record<string, string>)) images[Number(k)] = path.join(dir, f);
const say = (m: string) => console.log("\n▶ " + m);
console.log("\n[ 프로그램 버전 v8 — 글 폴더 고르기(post / post-eyeclear) ]");
console.log("  이번에 넣을 글 폴더: " + (process.argv[2] || "post"));

say("네이버 로그인 상태를 확인하고 있어요 (30초쯤 걸려요)");
let s = await verifySession();
if (!s.valid) {
  say("네이버 로그인 창을 열게요. 평소처럼 로그인해 주세요.\n  ★ '로그인 상태 유지' 를 꼭 켜주세요. 로그인이 끝나면 창은 저절로 닫혀요.");
  const r = await loginInteractive();
  if (!r.ok) { say("로그인이 끝나지 않았어요: " + r.message + "\n  다시 하려면 같은 명령을 한 번 더 입력하세요."); process.exit(1); }
  invalidateSessionCache();
  s = await verifySession();
  if (!s.valid) { say("로그인은 했는데 글쓰기 권한 확인이 안 돼요(" + s.reason + "). '로그인 상태 유지' 를 켜고 다시 해주세요."); process.exit(1); }
}
say(`로그인 확인! 블로그(${s.blogId})에 글을 입력할게요.\n  브라우저 창이 열리면 건드리지 말고 지켜만 봐주세요. 3~5분 걸려요.\n  ※ 발행은 하지 않고 임시저장만 합니다.\n  ※ 저장이 끝나면 창을 그대로 열어 둡니다. 글을 확인한 뒤 그 창을 닫으면 끝나요.`);
const r = await publishToNaver({
  jobId: 0, title: post.title, sections: post.sections, images, headingAsQuote: post.headingAsQuote ?? true,
  dryRun: false, saveDraftOnly: true, keepOpenAfterSave: true, visibility: "private", headless: false, blogId: s.blogId,
  log: (m, l) => console.log(`  ${l === "warn" ? "⚠" : l === "error" ? "✖" : "·"} ${m}`),
});
if (r.status === "draft_saved") say("완료! " + r.note + "\n  창을 닫으셨으니 끝났어요. 나중에 다시 보려면: 네이버 블로그 → 글쓰기 → 위쪽 '저장' 옆 숫자.");
else say("임시저장을 끝내지 못했어요: " + r.note);
if (r.screenshot) console.log("  완성 화면 사진: " + r.screenshot);
process.exit(r.status === "draft_saved" ? 0 : 1);
