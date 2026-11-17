// 계정 없이 돌릴 수 있는 검사 전부: 계산·안전장치·셀렉터 최소재현 + 로컬 하네스
import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "blogtest-"));
execSync("npx tsx scripts/test-unit.mts", { stdio: "inherit" });
execSync(`npx tsx scripts/test-harness.mts "${tmp}"`, { stdio: "inherit" });
