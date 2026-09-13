/**
 * 無料診断（`/` と `/meo`）だけの枠。本サービス（管理画面）とは切り離す。
 *
 * 無料診断は見込み客に URL をそのまま渡す集客の入口なので、有料ツールのサイドバーや
 * 機能 ID を見せない（利用者の決定 2026-09-13）。出すのは「何のサービスか」「詳細診断の入口」
 * 「規約類」だけにして、迷わず申し込みへ進める形にする。
 *
 * ログイン状態の出し分けは FreeHeaderActions（Clerk のフックを使う）に閉じ込め、
 * Clerk のキーが無い環境（開発・E2E）ではヘッダーに申し込みボタンだけを出す。
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { buttonClass } from "@/components/ui/Button";
import { LogoMark } from "@/components/shell/icons";
import { SIGN_UP_PATH } from "@/lib/free/upsell";
import { SERVICE_NAME } from "@/lib/legal/operator";
import { FreeHeaderActions } from "./FreeHeaderActions";

export interface FreeShellProps {
  children: ReactNode;
  /** Clerk のキーが設定されているか。false ならログイン状態を見ない */
  authEnabled: boolean;
}

export function FreeShell({ children, authEnabled }: FreeShellProps) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="no-print sticky top-0 z-10 flex h-12 items-center gap-3 border-b border-line bg-panel px-4 md:px-8">
        <Link href="/" className="flex min-w-0 items-center gap-2 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
          <LogoMark className="h-5 w-5 shrink-0 text-brand" />
          <span className="truncate text-sm font-bold text-ink">{SERVICE_NAME}</span>
          <span className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent">無料診断</span>
        </Link>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {authEnabled ? (
            <FreeHeaderActions />
          ) : (
            <Link href={SIGN_UP_PATH} className={buttonClass("primary", "sm")}>
              初月無料ではじめる
            </Link>
          )}
        </div>
      </header>

      <div className="flex-1">{children}</div>

      <footer className="no-print border-t border-line px-4 py-4 text-[11px] text-muted md:px-8">
        <p>
          この診断はログイン不要・無料でお使いいただけます。結果の続き（実データの計測・競合比較・AI の改修案）は
          <Link href={SIGN_UP_PATH} className="mx-1 text-accent underline underline-offset-2">
            詳細診断
          </Link>
          でご利用いただけます。
        </p>
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          <Link href="/terms" className="underline underline-offset-2 hover:text-ink">
            利用規約
          </Link>
          <Link href="/privacy" className="underline underline-offset-2 hover:text-ink">
            プライバシーポリシー
          </Link>
          <Link href="/legal/tokushoho" className="underline underline-offset-2 hover:text-ink">
            特定商取引法に基づく表記
          </Link>
        </p>
      </footer>
    </div>
  );
}
