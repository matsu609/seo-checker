/**
 * ログイン不要の API（無料診断）向けの簡易な回数制限。プロセス内メモリ。
 *
 * 無料 MEO 診断は Google Places に実費が出るため、誰でも叩ける入口には
 * 「クライアント（IP）ごとの回数」と「1 日の全体上限」の両方を置く。
 * Vercel の関数は複数インスタンスで動くので厳密ではないが、
 * 上限の数倍を超える事故は防げる（厳密にしたければ Supabase に移す）。
 *
 * 純粋な関数にして、時刻を注入できるようにしてある（テスト用）。
 */

export interface WindowLimit {
  /** 窓の長さ（ms） */
  windowMs: number;
  /** 窓の中で許す回数 */
  limit: number;
}

interface Bucket {
  /** 窓の中の実行時刻（ms）。古いものから消す */
  hits: number[];
}

interface DayCounter {
  /** YYYY-MM-DD（UTC） */
  day: string;
  count: number;
}

interface Store {
  buckets: Map<string, Bucket>;
  days: Map<string, DayCounter>;
}

/** dev のホットリロードで数えが飛ばないよう globalThis に置く */
function store(): Store {
  const g = globalThis as unknown as { __seo_checker_free_limits?: Store };
  g.__seo_checker_free_limits ??= { buckets: new Map(), days: new Map() };
  return g.__seo_checker_free_limits;
}

/** テスト用: すべて消す */
export function resetFreeLimits(): void {
  const s = store();
  s.buckets.clear();
  s.days.clear();
}

/**
 * クライアントごとの回数制限。許可なら true を返して 1 回消費する。
 * `name` はバケットの種類（"meo-search" など）、`key` はクライアント識別子。
 */
export function takeClientToken(name: string, key: string, rule: WindowLimit, now = Date.now()): boolean {
  const s = store();
  const id = `${name}:${key}`;
  const bucket = s.buckets.get(id) ?? { hits: [] };
  const from = now - rule.windowMs;
  bucket.hits = bucket.hits.filter((t) => t > from);
  if (bucket.hits.length >= rule.limit) {
    s.buckets.set(id, bucket);
    return false;
  }
  bucket.hits.push(now);
  s.buckets.set(id, bucket);
  // バケットが増えすぎないよう、たまに古いものを捨てる
  if (s.buckets.size > 5000) {
    for (const [k, b] of s.buckets) {
      if (b.hits.length === 0 || b.hits[b.hits.length - 1] <= from) s.buckets.delete(k);
    }
  }
  return true;
}

function dayOf(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

/** 1 日の全体上限。許可なら true を返して 1 回消費する */
export function takeDailyToken(name: string, limit: number, now = Date.now()): boolean {
  const s = store();
  const day = dayOf(now);
  const counter = s.days.get(name);
  if (!counter || counter.day !== day) {
    s.days.set(name, { day, count: 1 });
    return limit >= 1;
  }
  if (counter.count >= limit) return false;
  counter.count += 1;
  return true;
}

/** 現在の消費数（管理画面・テスト用） */
export function dailyCount(name: string, now = Date.now()): number {
  const counter = store().days.get(name);
  return counter && counter.day === dayOf(now) ? counter.count : 0;
}

/** クライアントの識別子（プロキシ経由の元 IP → 直接接続の IP → 不明） */
export function clientKeyOf(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || request.headers.get("x-real-ip") || "unknown";
}

/** 環境変数の整数（無ければ既定） */
export function envInt(name: string, fallback: number): number {
  const v = Number.parseInt(process.env[name] ?? "", 10);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

/* ───────────── 無料 MEO 診断の既定値 ───────────── */

/** 1 クライアントあたりの検索回数（1 時間） */
export const FREE_MEO_SEARCH_PER_HOUR: WindowLimit = { windowMs: 60 * 60 * 1000, limit: 30 };
/** 1 クライアントあたりの報告書作成回数（1 時間） */
export const FREE_MEO_REPORT_PER_HOUR: WindowLimit = { windowMs: 60 * 60 * 1000, limit: 10 };
/** 1 日の全体上限（報告書。Google への詳細取得 1 回 ≒ 4 円が上限）。環境変数 FREE_MEO_DAILY_LIMIT で上書き */
export const FREE_MEO_DAILY_REPORTS_DEFAULT = 500;
/** 1 日の全体上限（検索） */
export const FREE_MEO_DAILY_SEARCHES_DEFAULT = 1500;

export const FREE_LIMIT_MESSAGE = "無料診断の本日の枠に達しました。明日またお試しいただくか、ログインしてツールをご利用ください。";
export const CLIENT_LIMIT_MESSAGE = "短時間に多くの診断が行われました。1 時間ほど待ってからもう一度お試しください。";

/* ───────────── 口コミ支援（来店客向けアンケート /api/r/*）の既定値 ───────────── */

/**
 * 店内の Wi-Fi 越しだと来店客の多くが同じ IP になるので、IP ごとの上限はゆるめにし、
 * 荒らし対策はアンケートごとの 1 日の上限（REVIEW_FORM_DAILY_LIMIT）で行う。
 */
export const REVIEW_FORM_GET_PER_HOUR: WindowLimit = { windowMs: 60 * 60 * 1000, limit: 120 };
export const REVIEW_ANSWER_PER_HOUR: WindowLimit = { windowMs: 60 * 60 * 1000, limit: 30 };
export const REVIEW_EVENT_PER_HOUR: WindowLimit = { windowMs: 60 * 60 * 1000, limit: 60 };
/** アンケート 1 つあたりの 1 日の回答数。環境変数 REVIEW_FORM_DAILY_LIMIT で上書き */
export const REVIEW_FORM_DAILY_DEFAULT = 500;
/** AI 下書きの 1 日の全体上限（超えたら回答は受け付け、下書きはルールに落とす）。REVIEW_AI_DAILY_LIMIT で上書き */
export const REVIEW_AI_DAILY_DEFAULT = 2000;

export const REVIEW_CLIENT_LIMIT_MESSAGE = "短時間に多くの送信がありました。しばらく待ってからもう一度お試しください。";
export const REVIEW_FORM_LIMIT_MESSAGE = "本日のこのアンケートの受付枠に達しました。明日またお試しください。";
