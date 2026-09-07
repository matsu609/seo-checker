import type { ReactNode } from "react";
import type { IntegrationKey } from "@/lib/features/integrations";
import type { Feature } from "@/lib/features/registry";
import { Badge, FeatureIdChips } from "./Badge";
import { RequiresNotice } from "./RequiresNotice";

export interface PageHeaderProps {
  /** registry の項目。title / description / featureIds / requires の既定値になる */
  feature?: Feature;
  title?: ReactNode;
  description?: ReactNode;
  featureIds?: readonly string[];
  /** 右側のボタン等 */
  actions?: ReactNode;
  /** 未設定なら SetupNotice を自動表示する連携（feature があればそちらの値を使う） */
  requires?: readonly IntegrationKey[];
  requiresAny?: readonly IntegrationKey[];
  /** β バッジ等（feature があれば status から自動） */
  badge?: ReactNode;
  className?: string;
}

/**
 * ツールページの先頭。h1 20px / 700 + 説明 13px muted + 機能 ID チップ。
 * 外部依存が未設定なら下に SetupNotice を出す。
 */
export function PageHeader({
  feature,
  title,
  description,
  featureIds,
  actions,
  requires,
  requiresAny,
  badge,
  className = "",
}: PageHeaderProps) {
  const ids = featureIds ?? feature?.featureIds ?? [];
  const req = requires ?? feature?.requires ?? [];
  const reqAny = requiresAny ?? feature?.requiresAny ?? [];
  const statusBadge = badge ?? (feature?.status === "beta" ? <Badge tone="neutral">β</Badge> : null);
  return (
    <header className={`mb-6 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold text-ink">{title ?? feature?.label}</h1>
            <FeatureIdChips ids={ids} />
            {statusBadge}
          </div>
          {(description ?? feature?.description) && (
            <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-muted">
              {description ?? feature?.description}
            </p>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {(req.length > 0 || reqAny.length > 0) && (
        <RequiresNotice requires={req} requiresAny={reqAny} className="mt-4" />
      )}
    </header>
  );
}
