"use client";

import Link from "next/link";
import { forwardRef } from "react";
import { INTEGRATIONS, type IntegrationStatus } from "@/lib/features/integrations";
import {
  categoryForPath,
  FEATURE_CATEGORIES,
  FREE_SUITE_LABEL,
  groupsForSidebar,
  isFeatureActive,
  type Feature,
  type FeatureCategoryId,
} from "@/lib/features/registry";
import { planShortLabel, upgradeTarget } from "@/lib/plans/catalog";
import { useStore } from "@/lib/store/hooks";
import { sidebarTabStore } from "@/lib/store/sidebar";
import { useIntegrations } from "@/lib/store/useIntegrations";
import { canUseFeature, useAccess } from "@/lib/store/usePlan";
import { CloseIcon, FeatureIconSvg, LogoMark } from "./icons";

export interface SidebarProps {
  pathname: string;
  version: string;
  /** ドロワーで使うとき: 項目クリックで閉じる */
  onNavigate?: () => void;
  /** ドロワーで使うとき: 右上の閉じるボタン */
  onClose?: () => void;
}

/** 未設定の連携があるか（要設定バッジ） */
function needsSetup(feature: Feature, status: IntegrationStatus | null): boolean {
  if (!status) return false;
  if (feature.requires.some((k) => !status[k])) return true;
  if (feature.requiresAny && feature.requiresAny.length > 0 && !feature.requiresAny.some((k) => status[k])) return true;
  return false;
}

function missingLabel(feature: Feature, status: IntegrationStatus | null): string {
  if (!status) return "";
  const keys = [...feature.requires.filter((k) => !status[k]), ...(feature.requiresAny ?? [])];
  return keys.map((k) => INTEGRATIONS[k].envVars.join(" + ")).join(", ");
}

/**
 * 藍のサイドバー本体。デスクトップの <aside> とモバイルのドロワーで共用する。
 * 定義は registry のみ。ここでは描画だけ。
 */
export const Sidebar = forwardRef<HTMLButtonElement, SidebarProps>(function Sidebar(
  { pathname, version, onNavigate, onClose },
  closeRef,
) {
  const [saved, setSaved] = useStore(sidebarTabStore);
  // 開いている画面のタブを優先。共通の画面（設定など）では最後に選んだタブ
  const pathCategory = categoryForPath(pathname);
  const tab: FeatureCategoryId = pathCategory ?? saved.tab;
  const { free, tools } = groupsForSidebar(tab);
  const { status } = useIntegrations();
  const access = useAccess();

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

      {/* 無料診断（単独ブロック）。サイト（SEO・AIO）と店舗（MEO）の 2 本 */}
      <div className="mx-3 mt-4 rounded-md border border-on-brand/25 p-1">
        <div className="px-2 pt-1 pb-1 text-[11px] font-bold text-on-brand-muted">{FREE_SUITE_LABEL}</div>
        <ul className="space-y-0.5">
          {free.map((f) => {
            const active = isFeatureActive(f, pathname);
            const setup = needsSetup(f, status);
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
                  {setup ? (
                    <span className="rounded-sm border border-on-brand-muted px-1 text-[10px] leading-4 text-on-brand-muted">準備中</span>
                  ) : (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${
                        active ? "bg-brand text-on-brand" : "bg-on-brand text-brand"
                      }`}
                    >
                      無料
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="px-2 pt-1 pb-1 text-[11px] leading-snug text-on-brand-muted">
          URL または店名だけで診断・PDF 出力。ログイン・API 不要
        </p>
      </div>

      {/* ツール */}
      <div className="mt-6 flex items-center gap-2 px-4">
        <span className="text-[11px] font-bold text-on-brand-muted">ツール</span>
        <span className="rounded-full border border-on-brand-muted px-1.5 text-[10px] font-bold leading-4 text-on-brand-muted">
          β
        </span>
      </div>

      {/* SEO / AIO / MEO のタブ。定義は registry の FEATURE_CATEGORIES */}
      <div role="tablist" aria-label="ツールの分類" className="mx-3 mt-2 grid grid-cols-3 gap-1 rounded-md border border-on-brand/25 p-1">
        {FEATURE_CATEGORIES.map((c) => {
          const selected = c.id === tab;
          return (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={selected}
              title={c.description}
              onClick={() => setSaved({ tab: c.id })}
              className={`h-8 rounded-sm text-[12px] font-bold outline-none focus-visible:ring-2 focus-visible:ring-on-brand/60 ${
                selected ? "bg-on-brand text-brand" : "text-on-brand/90 hover:bg-on-brand/10"
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      {tools.map((group) => (
        <div key={group.id}>
          <div className="mt-4 mb-1 px-4 text-[11px] text-on-brand-muted">{group.label}</div>
          <ul className="space-y-0.5">
            {group.features.map((f) => {
              const active = isFeatureActive(f, pathname);
              // プランが分かるまでは鍵を出さない（読み込み中に使えないよう見せない）。
              // 運用者が個別開放した機能も開いた扱いにする
              const locked = !canUseFeature(access, f.id, f.plan);
              const setup = !locked && needsSetup(f, status);
              return (
                <li key={f.id}>
                  <Link
                    href={f.path}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    title={f.label}
                    className={`relative mx-2 flex h-9 items-center gap-2.5 rounded-md px-3 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-on-brand/60 ${
                      active
                        ? "bg-on-brand/12 font-bold text-on-brand before:absolute before:top-1.5 before:bottom-1.5 before:left-0 before:w-[3px] before:rounded-r-sm before:bg-on-brand before:content-['']"
                        : "text-on-brand/90 hover:bg-on-brand/8"
                    }`}
                  >
                    <FeatureIconSvg icon={f.icon} className="h-4 w-4 shrink-0" />
                    <span className="min-w-0 flex-1 truncate">{f.shortLabel}</span>
                    {locked ? (
                      <span
                        title={`「${upgradeTarget(f.plan).label}」プランでご利用いただけます`}
                        className="rounded-sm border border-on-brand-muted px-1 text-[10px] leading-4 text-on-brand-muted"
                      >
                        {planShortLabel(f.plan)}
                      </span>
                    ) : setup ? (
                      <span
                        title={`未設定: ${missingLabel(f, status)}`}
                        className="rounded-sm border border-on-brand-muted px-1 text-[10px] leading-4 text-on-brand-muted"
                      >
                        要設定
                      </span>
                    ) : (
                      f.featureIds.length > 0 && (
                        <span className="inline-flex items-center gap-1" aria-label={`機能 ID ${f.featureIds.join(", ")}`}>
                          <span className="rounded-sm border border-on-brand/30 px-1 font-mono text-[10px] leading-4 text-on-brand-muted">
                            {f.featureIds[0]}
                          </span>
                          {f.featureIds.length > 1 && (
                            <span className="rounded-sm border border-on-brand/30 px-1 font-mono text-[10px] leading-4 text-on-brand-muted">
                              +{f.featureIds.length - 1}
                            </span>
                          )}
                        </span>
                      )
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {/* 運用者だけに出す。判定はサーバー（/api/plan）で、ここは表示の出し分けだけ */}
      {access?.admin && (
        <div>
          <div className="mt-4 mb-1 px-4 text-[11px] text-on-brand-muted">運用</div>
          <ul className="space-y-0.5">
            <li>
              <Link
                href="/admin"
                onClick={onNavigate}
                aria-current={pathname.startsWith("/admin") ? "page" : undefined}
                className={`relative mx-2 flex h-9 items-center gap-2.5 rounded-md px-3 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-on-brand/60 ${
                  pathname.startsWith("/admin")
                    ? "bg-on-brand/12 font-bold text-on-brand before:absolute before:top-1.5 before:bottom-1.5 before:left-0 before:w-[3px] before:rounded-r-sm before:bg-on-brand before:content-['']"
                    : "text-on-brand/90 hover:bg-on-brand/8"
                }`}
              >
                <FeatureIconSvg icon="dashboard" className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">マスター画面</span>
              </Link>
            </li>
          </ul>
        </div>
      )}

      {/* フッター */}
      <div className="mt-auto border-t border-on-brand/15 px-4 py-3 pt-3 text-[11px] text-on-brand-muted">
        <span className="tabular-nums">v{version}</span> · ルールベース診断
        <span className="mx-1.5" aria-hidden="true">
          ·
        </span>
        <Link
          href="/terms"
          onClick={onNavigate}
          className="rounded-sm underline underline-offset-2 outline-none hover:text-on-brand focus-visible:ring-2 focus-visible:ring-on-brand/60"
        >
          利用規約
        </Link>
        <span className="mx-1.5" aria-hidden="true">
          ·
        </span>
        <Link
          href="/privacy"
          onClick={onNavigate}
          className="rounded-sm underline underline-offset-2 outline-none hover:text-on-brand focus-visible:ring-2 focus-visible:ring-on-brand/60"
        >
          プライバシー
        </Link>
      </div>
    </nav>
  );
});
