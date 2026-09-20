"use client";

import { forwardRef } from "react";
import { FeedbackDialog } from "@/components/feedback/FeedbackDialog";
import { FeatureIdChips } from "@/components/ui/Badge";
import type { Feature } from "@/lib/features/registry";
import { AuthMenu } from "./AuthMenu";
import { MenuIcon } from "./icons";

export interface TopBarProps {
  feature: Feature | null;
  menuOpen: boolean;
  onOpenMenu: () => void;
  /** ドロワーの id（aria-controls） */
  drawerId: string;
  /** Clerk のキーが設定されているか。false ならログイン UI を出さない */
  authEnabled: boolean;
}

/**
 * 白いトップバー（sticky）。左 = ハンバーガー（md 未満）+ 現在ページのラベル。
 * PDF / 印刷ボタンはレポート内に置くので、右側は「ご意見・不具合」（運営者への報告。
 * どの画面からでも同じ場所から送れるようにここに置く。利用者の指示 2026-09-20）とログイン状態だけ。
 * 無料診断（/ と /meo）はこのトップバーを通らない（FreeShell が別のヘッダーを出す）。
 */
export const TopBar = forwardRef<HTMLButtonElement, TopBarProps>(function TopBar(
  { feature, menuOpen, onOpenMenu, drawerId, authEnabled },
  menuRef,
) {
  return (
    <div className="no-print sticky top-0 z-10 flex h-12 items-center gap-3 border-b border-line bg-panel px-4 md:px-8">
      <button
        ref={menuRef}
        type="button"
        onClick={onOpenMenu}
        aria-label="メニュー"
        aria-controls={drawerId}
        aria-expanded={menuOpen}
        className="-ml-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-ink outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent/40 md:hidden"
      >
        <MenuIcon className="h-5 w-5" />
      </button>
      <span className="truncate text-sm font-bold text-ink">{feature?.label ?? "SEO Checker"}</span>
      {feature && <FeatureIdChips ids={feature.featureIds} className="hidden sm:inline-flex" />}
      <div className="ml-auto flex shrink-0 items-center gap-1">
        <FeedbackDialog />
        {authEnabled && <AuthMenu />}
      </div>
    </div>
  );
});
