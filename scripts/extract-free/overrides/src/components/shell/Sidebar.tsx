"use client";

import Link from "next/link";
import { forwardRef } from "react";
import { FREE_SUITE_LABEL, groupsForSidebar, isFeatureActive } from "@/lib/features/registry";
import { CloseIcon, FeatureIconSvg, LogoMark } from "./icons";

export interface SidebarProps {
  pathname: string;
  version: string;
  /** ドロワーで使うとき: 項目クリックで閉じる */
  onNavigate?: () => void;
  /** ドロワーで使うとき: 右上の閉じるボタン */
  onClose?: () => void;
}

/**
 * 切り出し版のサイドバー。無料診断 2 本だけを出す。
 *
 * 本体（seo-checker）のサイドバーは、この下にツール群のタブ・一覧・プランの鍵・
 * 連携の「要設定」バッジ・マスター画面を並べるが、この版にはその画面が無いので
 * 取り除いてある（リンク切れを作らないため）。機能の定義そのもの
 * （src/lib/features/registry.ts）は本体と同じものをそのまま持っている。
 */
export const Sidebar = forwardRef<HTMLButtonElement, SidebarProps>(function Sidebar(
  { pathname, version, onNavigate, onClose },
  closeRef,
) {
  const { free } = groupsForSidebar();

  return (
    <nav aria-label="メインナビゲーション" className="flex min-h-full flex-col text-on-brand">
      {/* ブランド行 */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-on-brand/15 px-4">
        <LogoMark className="h-6 w-6 shrink-0" />
        <span className="text-[15px] font-bold">SEO Checker</span>
        {onClose && (
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="メニューを閉じる"
            className="ml-auto -mr-2 flex h-11 w-11 items-center justify-center rounded-md outline-none hover:bg-on-brand/10 focus-visible:ring-2 focus-visible:ring-on-brand/60"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* 無料診断。サイト（SEO・AIO）と店舗（MEO）の 2 本 */}
      <div className="mx-3 mt-4 rounded-md border border-on-brand/25 p-1">
        <div className="px-2 pt-1 pb-1 text-[11px] font-bold text-on-brand-muted">{FREE_SUITE_LABEL}</div>
        <ul className="space-y-0.5">
          {free.map((f) => {
            const active = isFeatureActive(f, pathname);
            return (
              <li key={f.id}>
                <Link
                  href={f.path}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  title={f.label}
                  className={`flex h-9 items-center gap-2.5 rounded-md px-2 text-[13px] font-bold outline-none focus-visible:ring-2 focus-visible:ring-on-brand/60 ${
                    active ? "bg-on-brand text-brand" : "text-on-brand hover:bg-on-brand/10"
                  }`}
                >
                  <FeatureIconSvg icon={f.icon} className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{f.shortLabel}</span>
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${
                      active ? "bg-brand text-on-brand" : "bg-on-brand text-brand"
                    }`}
                  >
                    無料
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="px-2 pt-1 pb-1 text-[11px] leading-snug text-on-brand-muted">
          URL または店名だけで診断・PDF 出力。ログイン・API 不要
        </p>
      </div>

      {/* フッター */}
      <div className="mt-auto border-t border-on-brand/15 px-4 py-3 pt-3 text-[11px] text-on-brand-muted">
        <span className="tabular-nums">v{version}</span> · ルールベース診断
      </div>
    </nav>
  );
});
