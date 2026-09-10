import { ClerkProvider } from "@clerk/nextjs";
import { jaJP } from "@clerk/localizations";
import type { Metadata } from "next";
import { AppShell } from "@/components/shell/AppShell";
import { isAuthEnabled, warnIfAuthDisabled } from "@/lib/auth/config";
import pkg from "../../package.json";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "SEO Checker | 無料 SEO・MEO・AIO 診断 と SEO/LLMO ツール",
    template: "%s | SEO Checker",
  },
  description:
    "URL を入れるだけで AI 検索（AIO）対策の状況をルールベースで診断し、報告書として PDF 出力できる無料診断ツール。順位計測・LLMO モニタリング・AI ライティングなどの SEO / LLMO ツールも同じ画面から使えます。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Clerk のキーが無い環境（開発・E2E）では ClerkProvider を差し込まない。
  // 差し込むと publishableKey が無いと言って例外になるため。
  const authEnabled = isAuthEnabled();
  warnIfAuthDisabled();

  const document = (
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full bg-surface text-ink">
        <AppShell version={process.env.NEXT_PUBLIC_APP_VERSION || pkg.version} authEnabled={authEnabled}>
          {children}
        </AppShell>
      </body>
    </html>
  );

  if (!authEnabled) return document;
  return <ClerkProvider localization={jaJP}>{document}</ClerkProvider>;
}
