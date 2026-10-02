/**
 * 無料診断の「今月の診断回数」の純粋な部分（クライアントからも読める）。
 * 数える・止めるのはサーバー（monthly.ts）。
 *
 * 利用者の決定 2026-10-02: パスワードの代わりに月の上限（既定 50 回）で守る。回数は無料診断の画面の上と
 * マスター画面に出す（不正利用と、営業がどれだけ使っているかが分かるように）。
 */

/** 月の上限の既定値（環境変数 FREE_MONTHLY_LIMIT で変えられる。0 で停止） */
export const FREE_MONTHLY_LIMIT_DEFAULT = 50;

/** 数える種類（サイト 1 ページ / サイト全体 / 店舗）。検索と FAQ は数えない（実費が小さい・診断に付随する） */
export const FREE_RUN_KINDS = ["free-page", "free-site", "free-meo"] as const;
export type FreeRunKind = (typeof FREE_RUN_KINDS)[number];

export const FREE_RUN_KIND_LABEL: Record<FreeRunKind, string> = {
  "free-page": "サイト（1 ページ）",
  "free-site": "サイト（全体）",
  "free-meo": "店舗",
};

export interface FreeRuns {
  /** 日本時間の今月（YYYY-MM） */
  month: string;
  used: number;
  limit: number;
  remaining: number;
  /** 翌月 1 日（YYYY-MM-DD）。いつ戻るか */
  resetsOn: string;
  /** 数えている場所。memory = Supabase が無い（デプロイで 0 に戻る・インスタンスごと） */
  source: "supabase" | "memory";
}

export interface FreeRunRecord {
  at: string;
  kind: FreeRunKind;
  /** 診断した URL か店名 */
  target: string;
  /** 送信元（IP）。不正利用の切り分け用 */
  ip: string | null;
}

export function isFreeExhausted(runs: FreeRuns | null): boolean {
  return runs !== null && runs.remaining <= 0;
}

export function freeRunsOf(month: string, used: number, limit: number, resetsOn: string, source: FreeRuns["source"]): FreeRuns {
  return { month, used, limit, remaining: Math.max(0, limit - used), resetsOn, source };
}

export function isFreeRunKind(value: unknown): value is FreeRunKind {
  return typeof value === "string" && (FREE_RUN_KINDS as readonly string[]).includes(value);
}

/** 上限に達したときの文面 */
export function freeMonthlyLimitMessage(runs: FreeRuns): string {
  const [y, m, d] = runs.resetsOn.split("-").map(Number);
  return `今月の無料診断は上限（${runs.limit} 回）に達しました（使用 ${runs.used} 回）。${y} 年 ${m} 月 ${d} 日に戻ります。`;
}
