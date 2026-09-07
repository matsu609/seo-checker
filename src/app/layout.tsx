import type { Metadata } from "next";
import { AppShell } from "@/components/shell/AppShell";
import pkg from "../../package.json";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "SEO Checker | 無料AIO診断 と SEO/LLMO ツール",
    template: "%s | SEO Checker",
  },
  description:
    "URL を入れるだけで AI 検索（AIO）対策の状況をルールベースで診断し、報告書として PDF 出力できる無料診断ツール。順位計測・LLMO モニタリング・AI ライティングなどの SEO / LLMO ツールも同じ画面から使えます。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full bg-surface text-ink">
        <AppShell version={process.env.NEXT_PUBLIC_APP_VERSION || pkg.version}>{children}</AppShell>
      </body>
    </html>
  );
}
