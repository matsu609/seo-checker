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

/** 最後に取得できた時刻（画面に「最終確認」として出す） */
let checkedAt: number | null = null;

function request(): Promise<IntegrationsPayload> {
  const p = fetch("/api/integrations", { cache: "no-store" })
    .then(async (r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return normalize(await r.json());
    })
    .then((payload) => {
      cache = payload;
      checkedAt = Date.now();
      return payload;
    })
    .finally(() => {
      if (inflight === p) inflight = null;
    });
  return p;
}

/**
 * 連携状況を取る。`force` のときは**必ず取り直す**
 * （進行中の取得を使い回すと「再確認」を押しても古い結果が返るため）。
 */
export async function fetchIntegrations(force = false): Promise<IntegrationsPayload> {
  if (force) {
    inflight = request();
    return inflight;
  }
  if (cache) return cache;
  inflight ??= request();
  return inflight;
}

export interface UseIntegrationsResult {
  /** 取得前は null。取得失敗時は全部 false */
  status: IntegrationStatus | null;
  /** 寿命のあるキーの失効日と残り日数（取得前・該当なしは空） */
  keyExpiry: IntegrationExpiries;
  /** 最初の取得が終わるまで true */
  loading: boolean;
  /** 「再確認」で取り直している間 true（ボタンの表示に使う） */
  refreshing: boolean;
  /** 最後に取得できた時刻。まだなら null */
  checkedAt: number | null;
  error: string | null;
  reload: () => void;
}

/** GET /api/integrations を取得して連携の有無を返す */
export function useIntegrations(): UseIntegrationsResult {
  const [payload, setPayload] = useState<IntegrationsPayload | null>(cache);
  const [at, setAt] = useState<number | null>(checkedAt);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let alive = true;
    // refreshing は「再確認」を押したときに立てる（効果の中で同期に setState しない）
    fetchIntegrations(tick > 0)
      .then((p) => {
        if (!alive) return;
        setPayload(p);
        setAt(checkedAt);
        setError(null);
      })
      .catch(() => {
        if (!alive) return;
        setPayload({ status: ALL_OFF, keyExpiry: {} });
        setError("連携状況を取得できませんでした");
      })
      .finally(() => {
        if (alive) setRefreshing(false);
      });
    return () => {
      alive = false;
    };
  }, [tick]);

  return {
    status: payload?.status ?? null,
    keyExpiry: payload?.keyExpiry ?? {},
    loading: payload === null,
    refreshing,
    checkedAt: at,
    error,
    reload: () => {
      setRefreshing(true);
      setTick((t) => t + 1);
    },
  };
}
