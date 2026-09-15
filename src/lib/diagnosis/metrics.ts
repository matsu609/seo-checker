/**
 * 基本計算（docs/dev/diagnosis-rules-spec.md §7）。全部純関数。
 *
 * ここに集めるのは「LLM に任せない計算」。ゼロ除算・前期 0・行別 CTR の平均と
 * いった間違えやすいところを 1 か所に閉じ込め、テストで固定する（§23 数値テスト）。
 */

/** 前期と当期の比較結果 */
export interface Change {
  current: number;
  previous: number;
  /** 増減率。前期が 0 のときは null（「新規発生」であって ∞ ではない） */
  rate: number | null;
  /** 前期が 0 で当期が 0 より大きい = 新規発生 */
  isNew: boolean;
  /** 差分（当期 - 前期） */
  diff: number;
}

/**
 * 増減率 =（当期値 - 前期値）÷ 前期値。
 * 前期が 0 の場合は増減率を計算せず、「新規発生」とする（§7）。
 */
export function changeOf(current: number, previous: number): Change {
  const diff = current - previous;
  if (previous === 0) {
    return { current, previous, rate: null, isNew: current > 0, diff };
  }
  return { current, previous, rate: diff / previous, isNew: false, diff };
}

export type Direction = "up" | "flat" | "down" | "new" | "unknown";

/**
 * 増減の向き。閾値（major_increase_rate / major_decrease_rate / flat_change_range）で
 * 3 段に分ける。「横ばい」は ±flat の内側だけを指し、その外で major に届かない
 * ものは "unknown"（どちらとも言えない）にする。断定を避けるため。
 */
export function directionOf(change: Change, t: { majorIncreaseRate: number; majorDecreaseRate: number; flatChangeRange: number }): Direction {
  if (change.isNew) return "new";
  if (change.rate === null) return "unknown";
  if (Math.abs(change.rate) <= t.flatChangeRange) return "flat";
  if (change.rate >= t.majorIncreaseRate) return "up";
  if (change.rate <= t.majorDecreaseRate) return "down";
  return "unknown";
}

/** 掲載順位の向き。数が小さいほど上位なので、増減の意味が逆になる */
export function positionDirection(current: number, previous: number, significant: number): "improved" | "worsened" | "flat" {
  const diff = current - previous;
  if (Math.abs(diff) < significant) return "flat";
  return diff < 0 ? "improved" : "worsened";
}

/** CTR = クリック ÷ 表示。行別 CTR の単純平均は使わない（§7） */
export function ctrOf(clicks: number, impressions: number): number {
  return impressions > 0 ? clicks / impressions : 0;
}

/** 比率。分母が 0 なら null（0% ではない） */
export function shareOf(part: number, whole: number): number | null {
  return whole > 0 ? part / whole : null;
}

/** エンゲージメント率 = エンゲージのあったセッション ÷ 全セッション */
export const engagementRate = shareOf;
/** CTA クリック率 = CTA クリックが発生したセッション ÷ 対象ページのセッション */
export const ctaClickRate = shareOf;
/** フォーム開始率 = フォーム開始セッション ÷ CTA クリックセッション */
export const formStartRate = shareOf;
/** フォーム完了率 = フォーム完了セッション ÷ フォーム開始セッション */
export const formCompletionRate = shareOf;
/** Organic CVR = Organic 経由のフォーム完了セッション ÷ Organic セッション */
export const organicConversionRate = shareOf;

/**
 * クエリ取得率 = クエリ一覧のクリック合計 ÷ サイト全体のクリック数。
 *
 * GSC はプライバシー保護のため、少数のクエリを匿名化して一覧から落とす。
 * この値が低いほど「一覧に出ているクエリ」はサイト全体の一部でしかない。
 */
export function queryCoverage(queryClicks: number, totalClicks: number): number | null {
  return shareOf(queryClicks, totalClicks);
}

/**
 * 指名検索比率 = 指名クエリのクリック ÷ クエリ一覧のクリック合計。
 * 必ず「一覧に出たクエリ内での比率」として扱う（§7 / §18）。
 */
export function brandClickShare(brandClicks: number, queryClicks: number): number | null {
  return shareOf(brandClicks, queryClicks);
}

/** 中央値（異常値の判定に使う。D08 / T10 / T11） */
export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** パーセント文字列（"12.3%"）も含めて数値にする（§23 数値テスト） */
export function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/,/g, "");
  if (!trimmed) return null;
  if (trimmed.endsWith("%")) {
    const n = Number(trimmed.slice(0, -1));
    return Number.isFinite(n) ? n / 100 : null;
  }
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

/** 日数（両端を含む）。ISO の日付文字列 */
export function daysBetween(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.floor((end - start) / 86_400_000) + 1;
}

/* ───────────── 表示用（事実シート・画面で共通に使う） ───────────── */

export function formatPercent(value: number | null, digits = 1): string {
  if (value === null) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

/** 増減率の表示。前期 0 は「新規」 */
export function formatChange(change: Change): string {
  if (change.isNew) return "新規発生（前期は 0）";
  if (change.rate === null) return "前期・当期とも 0";
  const sign = change.rate > 0 ? "+" : "";
  return `${sign}${(change.rate * 100).toFixed(1)}%`;
}

export function formatNumber(value: number): string {
  return Math.round(value).toLocaleString("ja-JP");
}
