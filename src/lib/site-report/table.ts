/**
 * 「最新の検索順位（自社・競合）」表の行（docs/reference/04_implementation-guide.md §18.3）。純関数。
 *
 * 行そのものは順位計測（B1）の buildRankRows を使い、ここではサイトレポート用の
 * トレンド区分・競合列・絞り込み・CSV 列だけを足す（同じデータを 2 回組み立てない）。
 */
import { rankDelta } from "@/lib/rank/classify";
import { rankText, type RankRow } from "@/lib/rank/rows";
import type { CsvColumn } from "@/lib/export/csv";
import { ctrForRank } from "./findability";

/** トレンドアイコンによる絞り込みの区分（§18.3） */
export type RankTrend = "up" | "flat" | "down" | "out" | "unknown";

export const TREND_ORDER = ["up", "flat", "down", "out"] as const;

/** 絞り込みの選択肢。「比較なし（unknown）」はボタンに出さないので含めない */
export type TrendFilter = "all" | "up" | "flat" | "down" | "out";

export const TREND_LABELS: Record<RankTrend, string> = {
  up: "上昇",
  flat: "横ばい",
  down: "下降",
  out: "圏外",
  unknown: "比較なし",
};

export const TREND_SYMBOLS: Record<RankTrend, string> = {
  up: "↑",
  flat: "→",
  down: "↓",
  out: "圏外",
  unknown: "—",
};

/** トレンドの文字色（Tailwind クラス） */
export const TREND_CLASSES: Record<RankTrend, string> = {
  up: "text-pass",
  flat: "text-muted",
  down: "text-fail",
  out: "text-muted",
  unknown: "text-muted",
};

/**
 * 最新順位と前回順位からトレンドを決める。
 * - 未取得（undefined）は "unknown"
 * - 最新が圏外なら、前回が何位でも "out"（圏外化も圏外のままも同じ扱い）
 * - 前回が圏外 → 最新がランクインなら "up"
 */
export function classifyTrend(
  current: number | null | undefined,
  previous: number | null | undefined,
): RankTrend {
  if (current === undefined) return "unknown";
  if (current === null) return "out";
  const { direction } = rankDelta(current, previous);
  if (direction === "up" || direction === "in") return "up";
  if (direction === "down") return "down";
  if (direction === "flat") return "flat";
  return "unknown";
}

export interface SiteReportRankRow extends RankRow {
  trend: RankTrend;
  /** 月間検索数。未登録は null */
  volume: number | null;
  /** 競合ドメイン → 最新順位（圏外は null、その競合を計測していなければ undefined） */
  competitors: Record<string, number | null | undefined>;
  /** この行がファインダビリティスコアに寄与する量（月間検索数 × CTR）。未登録は null */
  weighted: number | null;
}

/** 順位表の行 → サイトレポートの行 */
export function buildSiteReportRows(rows: readonly RankRow[]): SiteReportRankRow[] {
  return rows.map((row) => {
    const competitors: Record<string, number | null | undefined> = {};
    for (const c of row.current?.competitors ?? []) competitors[c.domain] = c.rank;
    const volume = typeof row.keyword.monthlyVolume === "number" ? row.keyword.monthlyVolume : null;
    return {
      ...row,
      trend: classifyTrend(row.currentRank, row.previousRank),
      volume,
      competitors,
      weighted: volume === null ? null : volume * ctrForRank(row.currentRank),
    };
  });
}

/** 表に出す競合ドメイン（最新スナップショットに出てくるものの和集合） */
export function competitorDomains(rows: readonly SiteReportRankRow[]): string[] {
  const set = new Set<string>();
  for (const row of rows) for (const domain of Object.keys(row.competitors)) set.add(domain);
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

/** トレンドでの絞り込み。"all" は素通し */
export function filterByTrend(
  rows: readonly SiteReportRankRow[],
  trend: RankTrend | "all",
): SiteReportRankRow[] {
  if (trend === "all") return [...rows];
  return rows.filter((row) => row.trend === trend);
}

/** トレンドごとの件数（フィルタのボタンに出す） */
export function countByTrend(rows: readonly SiteReportRankRow[]): Record<RankTrend, number> {
  const counts: Record<RankTrend, number> = { up: 0, flat: 0, down: 0, out: 0, unknown: 0 };
  for (const row of rows) counts[row.trend] += 1;
  return counts;
}

/** CSV の列。競合列は「競合の順位を表示」が ON のときだけ渡す */
export function buildCsvColumns(domains: readonly string[] = []): CsvColumn<SiteReportRankRow>[] {
  return [
    { header: "キーワード", value: (r) => r.keyword.keyword },
    { header: "グループ", value: (r) => r.groupName ?? "" },
    { header: "月間検索数", value: (r) => r.volume ?? "" },
    { header: "前回日", value: (r) => r.previous?.takenOn ?? "" },
    { header: "前回", value: (r) => rankText(r.previousRank) },
    { header: "最新日", value: (r) => r.current?.takenOn ?? "" },
    { header: "最新", value: (r) => rankText(r.currentRank) },
    { header: "変化", value: (r) => TREND_LABELS[r.trend] },
    { header: "URL", value: (r) => r.current?.url ?? r.keyword.targetUrl ?? "" },
    ...domains.map((domain) => ({
      header: `競合 ${domain}`,
      value: (r: SiteReportRankRow) =>
        domain in r.competitors ? rankText(r.competitors[domain]) : "",
    })),
  ];
}
