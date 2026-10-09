import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// FerrariSans is licensed; the design doc names Inter (weight 500 display) as the open substitute.
const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "할 일 관리",
  description: "일일 할 일을 주간 계획과 1년 목표로 연결하는 칸반 앱",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // The Next.js dev indicator floats at the bottom-left; data-dev lets the sidebar leave room for it.
  const isDev = process.env.NODE_ENV === "development";
  return (
    <html lang="ko" className={inter.variable}>
      <body data-dev={isDev ? "" : undefined}>{children}</body>
    </html>
  );
}
