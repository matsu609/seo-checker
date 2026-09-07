"use client";

import Link from "next/link";
import { forwardRef } from "react";
import { INTEGRATIONS, type IntegrationStatus } from "@/lib/features/integrations";
import { groupsForSidebar, isFeatureActive, type Feature } from "@/lib/features/registry";
import { useIntegrations } from "@/lib/store/useIntegrations";
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
  const { free, tools } = groupsForSidebar();
  const { status } = useIntegrations();
  const freeActive = isFeatureActive(free, pathname);

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

      {/* 無料診断（単独ブロック） */}
      <div className="mx-3 mt-4 rounded-md border border-on-brand/25 p-1">
        <div className="px-2 pt-1 pb-1 text-[11px] text-on-brand-muted">無料診断</div>
        <Link
          href={free.path}
          onClick={onNavigate}
          aria-current={freeActive ? "page" : undefined}
          className={`flex h-9 items-center gap-2.5 rounded-md px-2 text-[13px] font-bold outline-none focus-visible:ring-2 focus-visible:ring-on-brand/60 ${
            freeActive ? "bg-on-brand text-brand" : "text-on-brand hover:bg-on-brand/10"
          }`}
        >
          <FeatureIconSvg icon={free.icon} className="h-4 w-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{free.shortLabel}</span>
          <span
            className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${
              freeActive ? "bg-brand text-on-brand" : "bg-on-brand text-brand"
            }`}
          >
            無料
          </span>
        </Link>
        <p className="px-2 pt-1 pb-1 text-[11px] leading-snug text-on-brand-muted">
          URL だけで診断・PDF 出力。ログイン・API 不要
        </p>
      </div>

      {/* ツール */}
      <div className="mt-6 flex items-center gap-2 px-4">
        <span className="text-[11px] font-bold text-on-brand-muted">ツール</span>
        <span className="rounded-full border border-on-brand-muted px-1.5 text-[10px] font-bold leading-4 text-on-brand-muted">
          β
        </span>
      </div>

      {tools.map((group) => (
        <div key={group.id}>
          <div className="mt-4 mb-1 px-4 text-[11px] text-on-brand-muted">{group.label}</div>
          <ul className="space-y-0.5">
            {group.features.map((f) => {
              const active = isFeatureActive(f, pathname);
              const setup = needsSetup(f, status);
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
                    {setup ? (
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

      {/* フッター */}
      <div className="mt-auto border-t border-on-brand/15 px-4 py-3 pt-3 text-[11px] text-on-brand-muted">
        <span className="tabular-nums">v{version}</span> · ルールベース診断
      </div>
    </nav>
  );
});
