import "./globals.css";
import type { ReactNode } from "react";

export const metadata = { title: "블로그 자동 작성기", description: "네이버 블로그 글을 대신 쓰고 올리는 로컬 앱" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
