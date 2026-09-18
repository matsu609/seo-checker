/**
 * 無料診断の回数（メールアドレス = Clerk のユーザーごと）。純粋な部分（クライアントからも読める）。
 * 数える・止めるのはサーバー（quota.ts）。
 */

/** 上限の既定値（サイト診断 + 店舗診断の合計。利用者の決定 2026-09-18）。環境変数 FREE_DIAGNOSIS_LIMIT で変えられる */
export const FREE_RUN_LIMIT_DEFAULT = 2;
/** Clerk の privateMetadata のキー（サーバーだけが書く） */
export const FREE_RUNS_KEY = "freeRuns";

export interface FreeQuota {
  limit: number;
  used: number;
  remaining: number;
  /** 回数制限が無い（認証無効の開発環境・運用者・契約済み） */
  unlimited: boolean;
  reason: "auth-disabled" | "admin" | "paid" | null;
}

export function freeRunsFromMetadata(metadata: unknown): number {
  if (typeof metadata !== "object" || metadata === null) return 0;
  const v = (metadata as Record<string, unknown>)[FREE_RUNS_KEY];
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

export function quotaOf(used: number, limit: number): FreeQuota {
  return { limit, used, remaining: Math.max(0, limit - used), unlimited: false, reason: null };
}

export function unlimitedQuota(reason: FreeQuota["reason"], limit: number): FreeQuota {
  return { limit, used: 0, remaining: limit, unlimited: true, reason };
}

export function isExhausted(quota: FreeQuota | null): boolean {
  return quota !== null && !quota.unlimited && quota.remaining <= 0;
}

export const FREE_QUOTA_MESSAGE = "無料診断の回数を使い切りました。続きは料金プランからお申し込みください。";
