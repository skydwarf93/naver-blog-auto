export const runtime = "nodejs";
export const dynamic = "force-dynamic";
import fs from "node:fs";
import path from "node:path";
import { dataRoot, isInsideData } from "@/lib/paths";

const TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" };

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams.get("path") || "";
  const abs = path.resolve(dataRoot, p);
  // 경로 탈출 방지(resolve 후 접두사 검사) + ⚠️ 7-23 NFC 정규화(isInsideData 안에서)
  if (!p || !isInsideData(abs)) return new Response("forbidden", { status: 403 });
  let real = abs;
  if (!fs.existsSync(real)) {
    // macOS NFD/NFC: 디스크의 실제 이름 형태로 다시 시도
    const alt = [abs.normalize("NFD"), abs.normalize("NFC")].find((x) => fs.existsSync(x));
    if (!alt) return new Response("not found", { status: 404 });
    real = alt;
  }
  if (!fs.statSync(real).isFile()) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(fs.readFileSync(real)), { headers: { "Content-Type": TYPES[path.extname(real).toLowerCase()] || "application/octet-stream", "Cache-Control": "no-store" } });
}
