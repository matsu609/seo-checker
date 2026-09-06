import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AIO診断・FAQ生成 | SEO Checker",
  description:
    "URLを入れるだけで、AI検索（AIO）対策の状況をルールベースで診断し、FAQ構造化データを生成するツール",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-surface text-ink">{children}</body>
    </html>
  );
}
