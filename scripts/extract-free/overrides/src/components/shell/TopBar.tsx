"use client";

import { forwardRef } from "react";
import { Badge, FeatureIdChips } from "@/components/ui/Badge";
import type { Feature } from "@/lib/features/registry";
import { MenuIcon } from "./icons";

export interface TopBarProps {
  feature: Feature | null;
  menuOpen: boolean;
  onOpenMenu: () => void;
  /** ドロワーの id（aria-controls） */
  drawerId: string;
}

/**
 * 白いトップバー（sticky）。左 = ハンバーガー（md 未満）+ 現在ページのラベル。
 * PDF / 印刷ボタンはレポート内に置くので、右側には何も置かない
 * （切り出し版はログインを持たない）。
 */
export const TopBar = forwardRef<HTMLButtonElement, TopBarProps>(function TopBar(
  { feature, menuOpen, onOpenMenu, drawerId },
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
    </div>
  );
});
