"use client";

import { INTEGRATIONS, type IntegrationKey } from "@/lib/features/integrations";
import { useIntegrations } from "@/lib/store/useIntegrations";
import { SetupNotice, type MissingIntegration } from "./SetupNotice";

export interface RequiresNoticeProps {
  /** 全部必要な連携 */
  requires?: readonly IntegrationKey[];
  /** いずれか 1 つで可 */
  requiresAny?: readonly IntegrationKey[];
  className?: string;
}

function toMissing(keys: readonly IntegrationKey[]): MissingIntegration[] {
  return keys.flatMap((key) =>
    INTEGRATIONS[key].envVars.map((envVar) => ({ key, envVar, description: INTEGRATIONS[key].description })),
  );
}

/**
 * GET /api/integrations を見て、足りない連携があれば SetupNotice を出す。
 * 取得前（null）は何も出さない（ちらつき防止）。
 */
export function RequiresNotice({ requires = [], requiresAny = [], className }: RequiresNoticeProps) {
  const { status } = useIntegrations();
  if (!status) return null;
  const missingAll = requires.filter((k) => !status[k]);
  const anySatisfied = requiresAny.length === 0 || requiresAny.some((k) => status[k]);
  if (missingAll.length === 0 && anySatisfied) return null;
  return (
    <div className={`space-y-3 ${className ?? ""}`}>
      {missingAll.length > 0 && <SetupNotice missing={toMissing(missingAll)} />}
      {!anySatisfied && <SetupNotice missing={toMissing(requiresAny)} anyOf />}
    </div>
  );
}
