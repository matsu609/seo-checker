"use client";

import Link from "next/link";
import { forwardRef, useState } from "react";
import { INTEGRATIONS, type IntegrationStatus } from "@/lib/features/integrations";
import {
  AIO_CATEGORY,
  categoryForPath,
  isFeatureActive,
  isPillar,
  sidebarTree,
  type Feature,
  type FeaturePillarId,
} from "@/lib/features/registry";
import { planShortLabel, upgradeTarget } from "@/lib/plans/catalog";
import { useStore } from "@/lib/store/hooks";
import { sidebarTabStore } from "@/lib/store/sidebar";
import { useIntegrations } from "@/lib/store/useIntegrations";
import { canUseFeature, useAccess, type Access } from "@/lib/store/usePlan";
import { ChevronIcon, CloseIcon, FeatureIconSvg, LogoMark } from "./icons";

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

const ITEM_CLASS = "relative mx-2 flex h-9 items-center gap-2.5 rounded-md px-3 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-on-brand/60";
const ACTIVE_CLASS =
  "bg-on-brand/12 font-bold text-on-brand before:absolute before:top-1.5 before:bottom-1.5 before:left-0 before:w-[3px] before:rounded-r-sm before:bg-on-brand before:content-['']";
const IDLE_CLASS = "text-on-brand/90 hover:bg-on-brand/8";

interface FeatureLinkProps {
  feature: Feature;
  pathname: string;
  status: IntegrationStatus | null;
  access: Access | null;
  onNavigate?: () => void;
  /** 柱の中の項目は少し右に寄せる */
  nested?: boolean;
}

/** ツール 1 件。鍵（プラン不足）→ 要設定 → 機能 ID の順で右端のバッジを決める */
function FeatureLink({ feature: f, pathname, status, access, onNavigate, nested = false }: FeatureLinkProps) {
  const active = isFeatureActive(f, pathname);
  // プランが分かるまでは鍵を出さない（読み込み中に使えないよう見せない）。
  // 運用者が個別開放した機能も開いた扱いにする
  const locked = !canUseFeature(access, f.id, f.plan);
  const setup = !locked && needsSetup(f, status);
  return (
    <li>
      <Link
        href={f.path}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        title={f.label}
        className={`${ITEM_CLASS} ${nested ? "ml-2" : ""} ${active ? ACTIVE_CLASS : IDLE_CLASS}`}
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
          <span title={`未設定: ${missingLabel(f, status)}`} className="rounded-sm border border-on-brand-muted px-1 text-[10px] leading-4 text-on-brand-muted">
            要設定
          </span>
        ) : (
          f.featureIds.length > 0 && (
            <span className="inline-flex items-center gap-1" aria-label={`機能 ID ${f.featureIds.join(", ")}`}>
              <span className="rounded-sm border border-on-brand/30 px-1 font-mono text-[10px] leading-4 text-on-brand-muted">{f.featureIds[0]}</span>
              {f.featureIds.length > 1 && (
                <span className="rounded-sm border border-on-brand/30 px-1 font-mono text-[10px] leading-4 text-on-brand-muted">+{f.featureIds.length - 1}</span>
              )}
            </span>
          )
        )}
      </Link>
    </li>
  );
}

/**
 * 藍のサイドバー本体。デスクトップの <aside> とモバイルのドロワーで共用する。
 * 定義は registry のみ。ここでは描画だけ。
 *
 * 構造は「AIO 対策（親）の中に SEO / MEO / サイテーションの 3 本の柱がある」をそのまま出す
 * （利用者の指示 2026-09-17）。柱は開閉式で、開いているのは 1 本。AI 検索モニタリングは
 * 柱ではなく AIO 対策全体の成果をはかるものなので、親の直下に置く。
 *
 * クイック診断（/ と /meo）はここに出さない（利用者の決定 2026-09-13）。
 * 料金を払っている画面に無料の診断が並んでいると、支払っている意味が薄れて見えるため。
 * 見込み客に渡す URL は運用者が直接案内する（docs/dev/OPERATIONS.md の「申し込みの入口」）。
 */
export const Sidebar = forwardRef<HTMLButtonElement, SidebarProps>(function Sidebar(
  { pathname, version, onNavigate, onClose },
  closeRef,
) {
  const [saved, setSaved] = useStore(sidebarTabStore);
  /**
   * 開いている柱は「この画面で押した柱」を最優先にし、別の画面へ移動したらその画面の柱、
   * 柱に属さない画面（設定・AI 検索モニタリング）では最後に押した柱を開く。
   * （以前は画面の分類が常に勝って、押しても切り替わらなかった。利用者の報告 2026-09-17）
   */
  const [picked, setPicked] = useState<{ pathname: string; tab: FeaturePillarId } | null>(null);
  const pathCategory = categoryForPath(pathname);
  const open: FeaturePillarId = picked && picked.pathname === pathname ? picked.tab : isPillar(pathCategory) ? pathCategory : saved.tab;
  function toggle(next: FeaturePillarId) {
    setPicked({ pathname, tab: next });
    setSaved({ tab: next });
  }
  const tree = sidebarTree();
  const { status } = useIntegrations();
  const access = useAccess();
  const linkProps = { pathname, status, access, onNavigate };
  /**
   * 管理アカウントにはお客様向けのツールを出さない（利用者の指示 2026-09-21「紛らわしい」）。
   * 管理アカウントはサービスの利用者ではなく、お客様の対応をする立場なので、
   * 出すのは「管理者用」（顧客管理・デモ用の無料クイック診断）だけにする。
   * 運用者（マスター）は自分で動作を確かめるので、従来どおり全部出す。
   */
  const managerOnly = access?.agency === true && access.admin !== true;

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

      {/* お客様向けのツール（管理アカウントには出さない） */}
      {!managerOnly && (
      <>
      {/* 親のくくり: AIO 対策 */}
      <div className="mt-5 px-4">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-bold text-on-brand">{AIO_CATEGORY.label}</span>
          <span className="rounded-full border border-on-brand-muted px-1.5 text-[10px] font-bold leading-4 text-on-brand-muted">β</span>
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-on-brand-muted">{AIO_CATEGORY.description}</p>
      </div>

      {/* 親の直下: AI 検索モニタリング */}
      {tree.umbrella.length > 0 && (
        <ul className="mt-3 space-y-0.5">
          {tree.umbrella.map((f) => (
            <FeatureLink key={f.id} feature={f} {...linkProps} />
          ))}
        </ul>
      )}

      {/* 柱: SEO / MEO / サイテーション（開閉式、開いているのは 1 本） */}
      <div className="mt-2 ml-4 border-l border-on-brand/20">
        {tree.pillars.map(({ category, features }) => {
          const isOpen = category.id === open;
          const containsCurrent = features.some((f) => isFeatureActive(f, pathname));
          return (
            <div key={category.id}>
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={`sidebar-pillar-${category.id}`}
                title={category.description}
                onClick={() => toggle(category.id)}
                className={`flex h-9 w-full items-center gap-1.5 px-3 text-left text-[12px] font-bold outline-none hover:bg-on-brand/8 focus-visible:ring-2 focus-visible:ring-on-brand/60 ${
                  isOpen || containsCurrent ? "text-on-brand" : "text-on-brand/80"
                }`}
              >
                <ChevronIcon open={isOpen} className="h-3.5 w-3.5 shrink-0 text-on-brand-muted" />
                <span className="min-w-0 flex-1 truncate">{category.label}</span>
                <span className="font-mono text-[10px] font-normal text-on-brand-muted">{features.length}</span>
              </button>
              {isOpen && (
                <div id={`sidebar-pillar-${category.id}`}>
                  <p className="mb-1 pr-3 pl-8 text-[11px] leading-relaxed text-on-brand-muted">{category.description}</p>
                  <ul className="mb-2 space-y-0.5">
                    {features.map((f) => (
                      <FeatureLink key={f.id} feature={f} {...linkProps} nested />
                    ))}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 共通: 料金・設定 */}
      <div>
        <div className="mt-4 mb-1 px-4 text-[11px] text-on-brand-muted">設定</div>
        <ul className="space-y-0.5">
          {tree.common.map((f) => (
            <FeatureLink key={f.id} feature={f} {...linkProps} />
          ))}
        </ul>
      </div>
      </>
      )}

      {/*
        運用者・管理アカウントだけに出す。判定はサーバー（/api/plan）で、ここは表示の出し分けだけ。
        画面そのものも、その立場でなければ 404 を返す（src/app/admin・src/app/clients）。

        マスター画面（システム・バックエンド）は運用者だけ。顧客管理（お客様の契約状況・
        ご利用状況・ご意見）は両方に出す（利用者の指示 2026-09-20）。
      */}
      {(access?.admin || access?.agency) && (
        <div>
          <div className="mt-4 mb-1 px-4 text-[11px] text-on-brand-muted">管理者用</div>
          <ul className="space-y-0.5">
            <li>
              <Link
                href="/clients"
                onClick={onNavigate}
                aria-current={pathname.startsWith("/clients") ? "page" : undefined}
                className={`${ITEM_CLASS} ${pathname.startsWith("/clients") ? ACTIVE_CLASS : IDLE_CLASS}`}
              >
                <FeatureIconSvg icon="dashboard" className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">顧客管理</span>
              </Link>
            </li>
            {access?.admin && (
              <li>
                <Link
                  href="/admin"
                  onClick={onNavigate}
                  aria-current={pathname.startsWith("/admin") ? "page" : undefined}
                  className={`${ITEM_CLASS} ${pathname.startsWith("/admin") ? ACTIVE_CLASS : IDLE_CLASS}`}
                >
                  <FeatureIconSvg icon="dashboard" className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">マスター画面</span>
                </Link>
              </li>
            )}
            {/*
              デモ用の無料クイック診断（月 50 回。利用者の決定 2026-09-18）。画面は無料診断のシェルで開く。
              **必ず新しいタブで開く**（利用者の指示 2026-09-21）。いま開いている管理者用の画面が
              無料診断に置き換わってしまうと、お客様の対応の途中で戻る手間がかかるため。
              外部サイトではないが、新しいタブを開く以上 rel は付けておく。
            */}
            {[
              { href: "/", label: "無料クイック診断（サイト）" },
              { href: "/meo", label: "無料クイック診断（店舗）" },
            ].map((demo) => (
              <li key={demo.href}>
                <a
                  href={demo.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={onNavigate}
                  className={`${ITEM_CLASS} ${IDLE_CLASS}`}
                  title={`${demo.label}を新しいタブで開きます`}
                >
                  <FeatureIconSvg icon="dashboard" className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{demo.label}</span>
                  <span className="text-[10px] text-on-brand-muted">別タブ</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* フッター */}
      <div className="mt-auto border-t border-on-brand/15 px-4 py-3 pt-3 text-[11px] text-on-brand-muted">
        <span className="tabular-nums">v{version}</span> · ルールベース診断
        <span className="mx-1.5" aria-hidden="true">
          ·
        </span>
        <Link href="/terms" onClick={onNavigate} className="rounded-sm underline underline-offset-2 outline-none hover:text-on-brand focus-visible:ring-2 focus-visible:ring-on-brand/60">
          利用規約
        </Link>
        <span className="mx-1.5" aria-hidden="true">
          ·
        </span>
        <Link href="/privacy" onClick={onNavigate} className="rounded-sm underline underline-offset-2 outline-none hover:text-on-brand focus-visible:ring-2 focus-visible:ring-on-brand/60">
          プライバシー
        </Link>
        <span className="mx-1.5" aria-hidden="true">
          ·
        </span>
        <Link href="/legal/tokushoho" onClick={onNavigate} className="rounded-sm underline underline-offset-2 outline-none hover:text-on-brand focus-visible:ring-2 focus-visible:ring-on-brand/60">
          特商法表記
        </Link>
      </div>
    </nav>
  );
});
