"use client";

import { useEffect, useState } from "react";
import { INTEGRATION_KEYS, type IntegrationStatus } from "@/lib/features/integrations";

/** 取得結果はページ内で共有する（PageHeader と Sidebar が同時に呼んでも 1 回だけ） */
let cache: IntegrationStatus | null = null;
let inflight: Promise<IntegrationStatus> | null = null;

const ALL_OFF: IntegrationStatus = Object.fromEntries(
  INTEGRATION_KEYS.map((k) => [k, false]),
) as IntegrationStatus;

function normalize(data: unknown): IntegrationStatus {
  const out = { ...ALL_OFF };
  if (data && typeof data === "object") {
    for (const key of INTEGRATION_KEYS) {
      out[key] = (data as Record<string, unknown>)[key] === true;
    }
  }
  return out;
}

export async function fetchIntegrations(force = false): Promise<IntegrationStatus> {
  if (cache && !force) return cache;
  if (!inflight) {
    inflight = fetch("/api/integrations", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return normalize(await r.json());
      })
      .then((status) => {
        cache = status;
        return status;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export interface UseIntegrationsResult {
  /** 取得前は null。取得失敗時は全部 false */
  status: IntegrationStatus | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/** GET /api/integrations を取得して連携の有無を返す */
export function useIntegrations(): UseIntegrationsResult {
  const [status, setStatus] = useState<IntegrationStatus | null>(cache);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    fetchIntegrations(tick > 0)
      .then((s) => {
        if (!alive) return;
        setStatus(s);
        setError(null);
      })
      .catch(() => {
        if (!alive) return;
        setStatus(ALL_OFF);
        setError("連携状況を取得できませんでした");
      });
    return () => {
      alive = false;
    };
  }, [tick]);

  return { status, loading: status === null, error, reload: () => setTick((t) => t + 1) };
}
