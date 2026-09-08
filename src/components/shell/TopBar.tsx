"use client";

import { forwardRef } from "react";
import { Badge, FeatureIdChips } from "@/components/ui/Badge";
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
 * PDF / 印刷ボタンはレポート内に置くので、右側はログイン状態だけ。
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
      {feature?.path === "/" ? (
        <Badge tone="free">無料</Badge>
      ) : (
        feature && <FeatureIdChips ids={feature.featureIds} className="hidden sm:inline-flex" />
      )}
      {authEnabled && (
        <div className="ml-auto flex shrink-0 items-center">
          <AuthMenu />
        </div>
      )}
    </div>
  );
});
