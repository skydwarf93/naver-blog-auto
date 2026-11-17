import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 네이티브 모듈과 브라우저 자동화는 번들링하지 않고 node 에서 그대로 불러온다
  serverExternalPackages: ["better-sqlite3", "playwright", "playwright-core"],
};

export default nextConfig;
