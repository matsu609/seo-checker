/**
 * KPI カード（GA4、当期 vs 前期）の計算と書式
 * （docs/reference/04_implementation-guide.md §18.1）。純関数。
 *
 * 「前期が 0」は増減率を計算できないので 0% ではなく null にする（画面は「—」と出す）。
 * 0 と「計算できない」を混ぜると、データが無い期間が「変化なし」に見えてしまう。
 */
import type { SiteMetrics } from "./types";

export type CompareDirection = "up" | "down" | "flat";

export interface Comparison {
  current: number;
  previous: number;
  /** 当期 − 前期 */
  delta: number;
  /** 増減率（0.087 = +8.7%）。前期が 0 で当期が 0 でないときは null */
  ratio: number | null;
  direction: CompareDirection;
}

function safe(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

/**
 * 前期比。
 * - 前期 > 0: ratio = (当期 − 前期) / 前期
 * - 前期 = 0 かつ 当期 = 0: 変化なしなので ratio = 0
 * - 前期 = 0 かつ 当期 > 0: 割合にできないので ratio = null（画面は「新規」「—」）
 */
export function compareValues(current: number, previous: number): Comparison {
  const cur = safe(current);
  const prev = safe(previous);
  const delta = cur - prev;
  const direction: CompareDirection = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const ratio = prev > 0 ? delta / prev : delta === 0 ? 0 : null;
  return { current: cur, previous: prev, delta, ratio, direction };
}

export type SiteKpiId =
  | "users"
  | "newUsers"
  | "engagementTime"
  | "engagementRate"
  | "organicSessions"
  | "keyEvents";

/** 値の見せ方。integer = 件数、duration = 秒、percent = 0〜1 の率 */
export type SiteKpiFormat = "integer" | "duration" | "percent";

export interface SiteKpiDef {
  id: SiteKpiId;
  label: string;
  /** GA4 のどの指標か（カード下の補足に出す） */
  hint: string;
  format: SiteKpiFormat;
  /** 増えるのが良い指標か（矢印の色の向き） */
  positiveIsGood: boolean;
}

/** KPI カードの定義（並び順そのまま画面に出る） */
export const SITE_KPIS: readonly SiteKpiDef[] = [
  { id: "users", label: "ユーザー数", hint: "GA4 totalUsers", format: "integer", positiveIsGood: true },
  { id: "newUsers", label: "新しいユーザー", hint: "GA4 newUsers", format: "integer", positiveIsGood: true },
  {
    id: "engagementTime",
    label: "平均エンゲージメント時間",
    hint: "GA4 userEngagementDuration ÷ activeUsers",
    format: "duration",
    positiveIsGood: true,
  },
  {
    id: "engagementRate",
    label: "エンゲージメント率",
    hint: "GA4 engagementRate",
    format: "percent",
    positiveIsGood: true,
  },
  {
    id: "organicSessions",
    label: "自然検索セッション",
    hint: "GA4 sessions（チャネル = Organic Search）",
    format: "integer",
    positiveIsGood: true,
  },
  { id: "keyEvents", label: "コンバージョン", hint: "GA4 keyEvents", format: "integer", positiveIsGood: true },
] as const;

/** 指標 → 1 期間分の値。平均エンゲージメント時間だけ 2 つの指標から割り算する */
export function metricValue(metrics: SiteMetrics, id: SiteKpiId): number {
  switch (id) {
    case "users":
      return safe(metrics.totalUsers);
    case "newUsers":
      return safe(metrics.newUsers);
    case "engagementTime":
      // アクティブユーザーが 0 の期間は「1 人あたり」を出せないので 0 にする
      return metrics.activeUsers > 0 ? safe(metrics.userEngagementDuration) / metrics.activeUsers : 0;
    case "engagementRate":
      return safe(metrics.engagementRate);
    case "organicSessions":
      return safe(metrics.organicSessions);
    case "keyEvents":
      return safe(metrics.keyEvents);
  }
}

export interface SiteKpi extends SiteKpiDef {
  comparison: Comparison;
}

/** KPI カード 6 枚分。当期・前期の素の指標から作る */
export function buildKpis(current: SiteMetrics, previous: SiteMetrics): SiteKpi[] {
  return SITE_KPIS.map((def) => ({
    ...def,
    comparison: compareValues(metricValue(current, def.id), metricValue(previous, def.id)),
  }));
}

/** 秒 → 「3分12秒」。60 秒未満は「42秒」 */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.round(safe(seconds)));
  if (s < 60) return `${s}秒`;
  return `${Math.floor(s / 60)}分${String(s % 60).padStart(2, "0")}秒`;
}

/** KPI の値の表示 */
export function formatKpiValue(format: SiteKpiFormat, value: number): string {
  const v = safe(value);
  if (format === "duration") return formatDuration(v);
  if (format === "percent") return `${(v * 100).toFixed(1)}%`;
  return Math.round(v).toLocaleString("ja-JP");
}

/** 増減率の表示（「+8.7%」）。計算できないときは「—」 */
export function formatRatio(ratio: number | null): string {
  if (ratio === null || !Number.isFinite(ratio)) return "—";
  const pct = ratio * 100;
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : "±";
  return `${sign}${Math.abs(pct).toFixed(1)}%`;
}
