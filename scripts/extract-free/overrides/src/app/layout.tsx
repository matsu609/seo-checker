import type { Metadata } from "next";
import { AppShell } from "@/components/shell/AppShell";
import pkg from "../../package.json";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "無料 SEO・MEO・AIO 診断",
    template: "%s | 無料 SEO・MEO・AIO 診断",
  },
  description:
    "URL を入れるだけで検索エンジンと AI 検索（AIO）に読まれる土台をルールベースで採点し、店名を入れるだけで Google マップの店舗情報を採点する無料診断。報告書として PDF 出力できます。ログイン不要。",
};

/**
 * 切り出し版のルートレイアウト。
 *
 * 本体（seo-checker）は Clerk でログインを扱うが、この版は無料診断だけなので
 * 認証は一切持たない（すべてのページが公開）。差分はここと AppShell / TopBar /
 * Sidebar の 4 ファイルだけに閉じている。
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full bg-surface text-ink">
        <AppShell version={process.env.NEXT_PUBLIC_APP_VERSION || pkg.version}>{children}</AppShell>
      </body>
    </html>
  );
}
