"use client";

import { useEffect, useState } from "react";
import { INTEGRATION_KEYS, type IntegrationKey, type IntegrationStatus } from "@/lib/features/integrations";
import type { KeyExpiry } from "@/lib/features/key-expiry";

/** キーに寿命がある連携の残り日数（日付だけ。キーの値は入らない） */
export type IntegrationExpiries = Partial<Record<IntegrationKey, KeyExpiry>>;

export interface IntegrationsPayload {
  status: IntegrationStatus;
  keyExpiry: IntegrationExpiries;
}

/** 取得結果はページ内で共有する（PageHeader と Sidebar が同時に呼んでも 1 回だけ） */
let cache: IntegrationsPayload | null = null;
let inflight: Promise<IntegrationsPayload> | null = null;

const ALL_OFF: IntegrationStatus = Object.fromEntries(
  INTEGRATION_KEYS.map((k) => [k, false]),
) as IntegrationStatus;

function normalize(data: unknown): IntegrationsPayload {
  const out = { ...ALL_OFF };
  const keyExpiry: IntegrationExpiries = {};
  if (data && typeof data === "object") {
    const row = data as Record<string, unknown>;
    // `status` があればそれ、無ければ最上位（古い形）を読む
    const flags = (row.status && typeof row.status === "object" ? row.status : row) as Record<string, unknown>;
    for (const key of INTEGRATION_KEYS) out[key] = flags[key] === true;
    if (row.keyExpiry && typeof row.keyExpiry === "object") {
      for (const key of INTEGRATION_KEYS) {
        const e = (row.keyExpiry as Record<string, unknown>)[key];
        if (e && typeof e === "object") keyExpiry[key] = e as KeyExpiry;
      }
    }
  }
  return { status: out, keyExpiry };
}

export async function fetchIntegrations(force = false): Promise<IntegrationsPayload> {
  if (cache && !force) return cache;
  if (!inflight) {
    inflight = fetch("/api/integrations", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return normalize(await r.json());
      })
      .then((payload) => {
        cache = payload;
        return payload;
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
  /** 寿命のあるキーの失効日と残り日数（取得前・該当なしは空） */
  keyExpiry: IntegrationExpiries;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

/** GET /api/integrations を取得して連携の有無を返す */
export function useIntegrations(): UseIntegrationsResult {
  const [payload, setPayload] = useState<IntegrationsPayload | null>(cache);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    fetchIntegrations(tick > 0)
      .then((p) => {
        if (!alive) return;
        setPayload(p);
        setError(null);
      })
      .catch(() => {
        if (!alive) return;
        setPayload({ status: ALL_OFF, keyExpiry: {} });
        setError("連携状況を取得できませんでした");
      });
    return () => {
      alive = false;
    };
  }, [tick]);

  return {
    status: payload?.status ?? null,
    keyExpiry: payload?.keyExpiry ?? {},
    loading: payload === null,
    error,
    reload: () => setTick((t) => t + 1),
  };
}
