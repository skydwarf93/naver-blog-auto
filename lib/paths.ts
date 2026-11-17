import fs from "node:fs";
import path from "node:path";

export const dataRoot = path.resolve(process.cwd(), "data");
export const paths = {
  root: dataRoot,
  db: path.join(dataRoot, "app.db"),
  session: path.join(dataRoot, "naver-session.json"),
  images: path.join(dataRoot, "images"),
  screenshots: path.join(dataRoot, "screenshots"),
};

export function ensureDirs() {
  for (const d of [paths.root, paths.images, paths.screenshots]) fs.mkdirSync(d, { recursive: true });
}
ensureDirs();

// ⚠️ 7-23: macOS 의 process.cwd() 는 한글을 NFD(자모 분해)로, 브라우저 URL 은 NFC 로 준다.
//    정규화 없이 startsWith 하면 한글 경로에서 모든 이미지가 403 이 된다. 윈도우는 대소문자도 통일.
export function normPath(x: string) {
  const n = path.resolve(x).normalize("NFC");
  return process.platform === "win32" ? n.toLowerCase() : n;
}

/** data 폴더 안쪽 파일인지 검사(경로 탈출 방지) */
export function isInsideData(p: string, root = dataRoot) {
  const r = normPath(root);
  const t = normPath(p);
  return t.startsWith(r + path.sep);
}
