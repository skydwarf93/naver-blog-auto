export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import { NextResponse } from "next/server";
import { execFile } from "node:child_process";

// ⚠️ 7-14: <input webkitdirectory> 는 절대경로를 주지 않는다 → 로컬 앱이므로 백엔드에서 OS 대화상자를 띄운다
// 2분 타임아웃 필수 — 대화상자를 방치하면 요청이 영원히 안 끝난다
function run(cmd: string, args: string[]): Promise<{ out: string; err: string }> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 120_000 }, (e, out, err) => {
      resolve({ out: String(out ?? ""), err: String(err ?? "") + (e?.killed ? " TIMEOUT" : "") });
    });
  });
}
const trimSep = (p: string) => p.trim().replace(/[\\/]+$/, "");

export async function POST() {
  if (process.platform === "darwin") {
    const r = await run("osascript", ["-e", 'POSIX path of (choose folder with prompt "블로그에 쓸 사진 폴더를 골라주세요")']);
    if (/User canceled|-128/.test(r.err)) return NextResponse.json({ canceled: true });
    if (/TIMEOUT/.test(r.err)) return NextResponse.json({ error: "2분 동안 선택이 없어 닫았습니다" });
    if (r.out.trim()) return NextResponse.json({ path: trimSep(r.out) });
    return NextResponse.json({ error: "폴더 창을 열지 못했습니다. 경로를 직접 입력해 주세요" });
  }
  if (process.platform === "win32") {
    // 미검증. WinForms 대화상자는 STA 에서만 뜬다 → -STA 필수. 취소 = stdout 이 빈 것
    const ps = "Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; if ($f.ShowDialog() -eq 'OK') { $f.SelectedPath }";
    const r = await run("powershell", ["-NoProfile", "-STA", "-Command", ps]);
    if (/TIMEOUT/.test(r.err)) return NextResponse.json({ error: "2분 동안 선택이 없어 닫았습니다" });
    if (!r.out.trim()) return NextResponse.json({ canceled: true });
    return NextResponse.json({ path: trimSep(r.out) });
  }
  return NextResponse.json({ error: "이 컴퓨터에서는 폴더 창을 띄울 수 없습니다. 경로를 직접 입력해 주세요" });
}
