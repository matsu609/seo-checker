/**
 * 無料診断の回数（メールアドレス = Clerk のユーザーごと）。純粋な部分（クライアントからも読める）。
 * 数える・止めるのはサーバー（quota.ts）。
 */

/** 上限の既定値（サイト診断 + 店舗診断の合計。利用者の決定 2026-09-18）。環境変数 FREE_DIAGNOSIS_LIMIT で変えられる */
export const FREE_RUN_LIMIT_DEFAULT = 2;
/** Clerk の privateMetadata のキー（サーバーだけが書く） */
export const FREE_RUNS_KEY = "freeRuns";

/**
 * 運用者・代理店のデモ用の枠（月あたり。利用者の決定 2026-09-18「サービス説明やクロージングのデモで、
 * ログインがうまくいかなくても無料診断だけはすぐ見せられるように」）。環境変数 FREE_DEMO_LIMIT で変えられる
 */
export const DEMO_RUN_LIMIT_DEFAULT = 50;
/** privateMetadata のキー。値は { month: "YYYY-MM", used: n }（月が変わればリセット） */
export const DEMO_RUNS_KEY = "demoRuns";

export interface FreeQuota {
  limit: number;
  used: number;
  remaining: number;
  /** 回数制限が無い（認証無効の開発環境・契約済み） */
  unlimited: boolean;
  /** demo = 運用者・代理店の月あたりの枠 */
  reason: "auth-disabled" | "admin" | "paid" | "demo" | null;
  /** 数える期間。省略時は通算（見込み客の 2 回） */
  period?: "month";
}

/** 日本時間の「今月」（YYYY-MM）。月が変わるとデモ用の回数が戻る */
export function monthKey(now: Date = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 7);
}

/** privateMetadata から今月のデモ用の使用回数を読む。月が違えば 0 */
export function demoRunsFromMetadata(metadata: unknown, month: string): number {
  if (typeof metadata !== "object" || metadata === null) return 0;
  const v = (metadata as Record<string, unknown>)[DEMO_RUNS_KEY];
  if (typeof v !== "object" || v === null) return 0;
  const { month: m, used } = v as Record<string, unknown>;
  if (m !== month) return 0;
  return typeof used === "number" && Number.isFinite(used) && used > 0 ? Math.floor(used) : 0;
}

export function demoQuotaOf(used: number, limit: number): FreeQuota {
  return { limit, used, remaining: Math.max(0, limit - used), unlimited: false, reason: "demo", period: "month" };
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
