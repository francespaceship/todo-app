import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "할 일 관리",
  description: "일일 할 일을 주간 계획과 1년 목표로 연결하는 칸반 앱",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // The Next.js dev indicator floats at the bottom-left; data-dev lets the sidebar leave room for it.
  const isDev = process.env.NODE_ENV === "development";
  return (
    <html lang="ko">
      <body data-dev={isDev ? "" : undefined}>{children}</body>
    </html>
  );
}
