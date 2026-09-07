/**
 * サイトレポート（E8）の GA4 リクエスト組み立てと応答の読み取り。
 *
 * runReport は 3 回だけ呼ぶ:
 *   1. KPI（当期・前期の 2 期間を dateRanges で 1 リクエスト。§18.1）
 *   2. 自然検索セッション（同じく 2 期間。チャネルで絞るので別リクエスト）
 *   3. 当期の 日 × チャネル（積み上げ棒の素データ）
 *
 * 組み立てと読み取りは純関数にしてあり、テストはネットワークに出ずに
 * Ga4Client を差し替えるだけでよい。
 */
import { toIsoDate } from "@/lib/ai-traffic/aggregate";
import { ORGANIC_SEARCH_CHANNEL } from "@/lib/ai-traffic/types";
import { dimensionValue, headerIndex, metricNumber } from "@/lib/ga4/client";
import { previousRange, type DateRange } from "@/lib/ga4/period";
import type { Ga4Client, Ga4Report, Ga4RunReportBody } from "@/lib/ga4/types";
import { EMPTY_SITE_METRICS, type ChannelDailyRow, type SiteMetrics, type SiteReportResponse } from "./types";

/** 日 × チャネルの行数上限（1 年 × 20 チャネルでも足りる） */
export const CHANNEL_ROW_LIMIT = 10_000;

/** KPI に使う GA4 指標（順序はリクエストの metrics と同じ） */
export const KPI_METRICS = [
  "totalUsers",
  "newUsers",
  "userEngagementDuration",
  "activeUsers",
  "engagementRate",
  "keyEvents",
] as const;

/** dateRanges に付ける名前。応答の dateRange ディメンションにそのまま出る */
export const CURRENT_RANGE_NAME = "current";
export const PREVIOUS_RANGE_NAME = "previous";

/** KPI（当期・前期）。ディメンションを付けないので 1 期間 1 行で返る */
export function buildKpiRequest(range: DateRange, previous: DateRange): Ga4RunReportBody {
  return {
    dateRanges: [
      { ...range, name: CURRENT_RANGE_NAME },
      { ...previous, name: PREVIOUS_RANGE_NAME },
    ],
    metrics: KPI_METRICS.map((name) => ({ name })),
  };
}

/** 自然検索セッション（当期・前期）。チャネル = Organic Search で絞る */
export function buildOrganicRequest(range: DateRange, previous: DateRange): Ga4RunReportBody {
  return {
    dateRanges: [
      { ...range, name: CURRENT_RANGE_NAME },
      { ...previous, name: PREVIOUS_RANGE_NAME },
    ],
    metrics: [{ name: "sessions" }],
    dimensionFilter: {
      filter: {
        fieldName: "sessionDefaultChannelGroup",
        stringFilter: { matchType: "EXACT", value: ORGANIC_SEARCH_CHANNEL },
      },
    },
  };
}

/** 当期の 日 × チャネル（積み上げ棒） */
export function buildChannelRequest(range: DateRange): Ga4RunReportBody {
  return {
    dateRanges: [{ ...range }],
    dimensions: [{ name: "date" }, { name: "sessionDefaultChannelGroup" }],
    metrics: [{ name: "sessions" }, { name: "totalUsers" }],
    orderBys: [{ dimension: { dimensionName: "date" } }],
    limit: CHANNEL_ROW_LIMIT,
  };
}

/**
 * dateRange ディメンションの値 → どちらの期間か。
 * name を付けているので "current" / "previous" で返るが、
 * 名前が無視された場合の "date_range_0" / "date_range_1" も受ける。
 */
export function rangeKeyOf(value: string): "current" | "previous" | null {
  if (value === CURRENT_RANGE_NAME || value === "date_range_0") return "current";
  if (value === PREVIOUS_RANGE_NAME || value === "date_range_1") return "previous";
  return null;
}

/** 2 期間の応答から、期間ごとに 1 行ずつ取り出す */
function rowsByRange(report: Ga4Report): { current: number; previous: number } {
  // dateRange ディメンションの位置。見つからなければ最後のディメンション
  const at = headerIndex(report.dimensionHeaders, "dateRange");
  const index = at >= 0 ? at : Math.max(0, report.dimensionHeaders.length - 1);
  const found: { current: number; previous: number } = { current: -1, previous: -1 };
  report.rows.forEach((row, i) => {
    const key = rangeKeyOf(dimensionValue(row, index));
    if (key && found[key] === -1) found[key] = i;
  });
  // dateRange が返らなかった（1 期間しか無い）ときは行の順序に従う
  if (found.current === -1 && found.previous === -1) {
    return { current: report.rows.length > 0 ? 0 : -1, previous: report.rows.length > 1 ? 1 : -1 };
  }
  return found;
}

/** KPI の応答 → 当期・前期の指標（自然検索セッションは別リクエスト） */
export function parseKpiReport(report: Ga4Report): { current: SiteMetrics; previous: SiteMetrics } {
  const at = (name: string) => headerIndex(report.metricHeaders, name);
  const index = rowsByRange(report);
  const read = (rowIndex: number): SiteMetrics => {
    if (rowIndex < 0) return { ...EMPTY_SITE_METRICS };
    const row = report.rows[rowIndex];
    const value = (name: string) => {
      const i = at(name);
      return i >= 0 ? metricNumber(row, i) : 0;
    };
    return {
      totalUsers: value("totalUsers"),
      newUsers: value("newUsers"),
      userEngagementDuration: value("userEngagementDuration"),
      activeUsers: value("activeUsers"),
      engagementRate: value("engagementRate"),
      keyEvents: value("keyEvents"),
      organicSessions: 0,
    };
  };
  return { current: read(index.current), previous: read(index.previous) };
}

/** 自然検索セッションの応答 → 当期・前期のセッション数 */
export function parseOrganicReport(report: Ga4Report): { current: number; previous: number } {
  const at = Math.max(0, headerIndex(report.metricHeaders, "sessions"));
  const index = rowsByRange(report);
  return {
    current: index.current >= 0 ? metricNumber(report.rows[index.current], at) : 0,
    previous: index.previous >= 0 ? metricNumber(report.rows[index.previous], at) : 0,
  };
}

/** 日 × チャネルの応答 → 素の行。日付が読めない行は捨てる */
export function parseChannelReport(report: Ga4Report): ChannelDailyRow[] {
  const sessionsAt = Math.max(0, headerIndex(report.metricHeaders, "sessions"));
  const usersAt = headerIndex(report.metricHeaders, "totalUsers");
  const rows: ChannelDailyRow[] = [];
  for (const row of report.rows) {
    const date = toIsoDate(dimensionValue(row, 0));
    if (!date) continue;
    rows.push({
      date,
      channel: dimensionValue(row, 1),
      sessions: metricNumber(row, sessionsAt),
      users: usersAt >= 0 ? metricNumber(row, usersAt) : 0,
    });
  }
  return rows;
}

export interface SiteReportInput {
  range: DateRange;
  /** 省略すると「同じ日数だけ直前」 */
  previous?: DateRange;
  now?: Date;
}

/** GA4 を 3 回叩いてレスポンスを組み立てる（Route Handler から呼ぶ） */
export async function fetchSiteReport(
  client: Ga4Client,
  input: SiteReportInput,
): Promise<SiteReportResponse> {
  const range = input.range;
  const prev = input.previous ?? previousRange(range);

  const [kpiReport, organicReport, channelReport] = await Promise.all([
    client.runReport(buildKpiRequest(range, prev)),
    client.runReport(buildOrganicRequest(range, prev)),
    client.runReport(buildChannelRequest(range)),
  ]);

  const kpis = parseKpiReport(kpiReport);
  const organic = parseOrganicReport(organicReport);

  return {
    range,
    previousRange: prev,
    current: { ...kpis.current, organicSessions: organic.current },
    previous: { ...kpis.previous, organicSessions: organic.previous },
    channels: parseChannelReport(channelReport),
    fetchedAt: (input.now ?? new Date()).toISOString(),
    truncated: channelReport.rows.length >= CHANNEL_ROW_LIMIT,
  };
}
