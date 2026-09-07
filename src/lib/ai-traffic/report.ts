/**
 * 生成 AI 流入分析（B6）の GA4 リクエスト組み立てと応答の読み取り。
 *
 * runReport は 2 回だけ呼ぶ:
 *   1. 日 × 参照元 × チャネル（3 系列と 2 つの率、サービス別はすべてこの 1 本から作る）
 *   2. ランディングページ × 参照元（キーイベント付き。辞書のホストで絞ってから返す）
 *
 * リクエストの組み立て・応答の読み取りは純関数にしてあり、
 * テストはネットワークに出ずに Ga4Client を差し替えるだけでよい。
 */
import { aiSourceFilterValues, matchAiSource, type AiSourceEntry } from "@/lib/ga4/ai-sources";
import { dimensionValue, headerIndex, metricNumber } from "@/lib/ga4/client";
import type { Ga4Client, Ga4Report, Ga4RunReportBody } from "@/lib/ga4/types";
import { toIsoDate } from "./aggregate";
import {
  MAX_KEY_EVENT_NAMES,
  isValidEventName,
  type AiTrafficDailyRow,
  type AiTrafficPageRow,
  type AiTrafficResponse,
} from "./types";

/** 時系列の行数上限（日 × 参照元 × チャネル） */
export const DAILY_ROW_LIMIT = 50_000;
/** ページ表の行数上限 */
export const PAGE_ROW_LIMIT = 1_000;

// 画面（クライアント）からも読めるよう実体は types.ts に置く。
// report.ts は node:crypto を使う GA4 クライアントに依存するので import できない
export { MAX_KEY_EVENT_NAMES, isValidEventName };

export function sanitizeKeyEventNames(names: readonly string[] | undefined): string[] {
  const out: string[] = [];
  for (const raw of names ?? []) {
    const name = raw.trim();
    if (!isValidEventName(name) || out.includes(name)) continue;
    out.push(name);
    if (out.length >= MAX_KEY_EVENT_NAMES) break;
  }
  return out;
}

/** 日 × 参照元 × チャネルのリクエスト */
export function buildDailyRequest(startDate: string, endDate: string): Ga4RunReportBody {
  return {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "date" }, { name: "sessionSource" }, { name: "sessionDefaultChannelGroup" }],
    metrics: [{ name: "sessions" }, { name: "totalUsers" }],
    orderBys: [{ dimension: { dimensionName: "date" } }],
    limit: DAILY_ROW_LIMIT,
  };
}

/**
 * ランディングページ × 参照元のリクエスト。
 * inListFilter は完全一致なので、辞書のホストと www 付きだけを列挙する
 * （サブドメイン経由の流入は時系列側で拾える。ページ表は件数を抑えるのを優先する）。
 */
export function buildPageRequest(
  startDate: string,
  endDate: string,
  keyEventNames: readonly string[],
  extraSources: readonly AiSourceEntry[] = [],
): Ga4RunReportBody {
  return {
    dateRanges: [{ startDate, endDate }],
    dimensions: [{ name: "landingPage" }, { name: "sessionSource" }],
    metrics: [
      { name: "sessions" },
      { name: "totalUsers" },
      { name: "keyEvents" },
      ...keyEventNames.map((name) => ({ name: `keyEvents:${name}` })),
    ],
    dimensionFilter: {
      filter: {
        fieldName: "sessionSource",
        inListFilter: { values: aiSourceFilterValues(extraSources), caseSensitive: false },
      },
    },
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    limit: PAGE_ROW_LIMIT,
  };
}

/** 時系列の応答 → 素の行。メトリクスはヘッダー名で引く（並び順に依存しない） */
export function parseDailyReport(report: Ga4Report): AiTrafficDailyRow[] {
  const sessionsAt = Math.max(0, headerIndex(report.metricHeaders, "sessions"));
  const usersAt = headerIndex(report.metricHeaders, "totalUsers");
  const rows: AiTrafficDailyRow[] = [];
  for (const row of report.rows) {
    const date = toIsoDate(dimensionValue(row, 0));
    if (!date) continue;
    rows.push({
      date,
      source: dimensionValue(row, 1),
      channel: dimensionValue(row, 2),
      sessions: metricNumber(row, sessionsAt),
      users: usersAt >= 0 ? metricNumber(row, usersAt) : 0,
    });
  }
  return rows;
}

/** ページ表の応答 → 行。辞書に無い参照元は service = null（表には「その他」と出す） */
export function parsePageReport(
  report: Ga4Report,
  keyEventNames: readonly string[],
  extraSources: readonly AiSourceEntry[] = [],
): AiTrafficPageRow[] {
  const sessionsAt = Math.max(0, headerIndex(report.metricHeaders, "sessions"));
  const usersAt = headerIndex(report.metricHeaders, "totalUsers");
  const keyEventsAt = headerIndex(report.metricHeaders, "keyEvents");
  const rows: AiTrafficPageRow[] = [];
  for (const row of report.rows) {
    const landingPage = dimensionValue(row, 0);
    const source = dimensionValue(row, 1);
    const keyEventsByName: Record<string, number> = {};
    for (const name of keyEventNames) {
      const at = headerIndex(report.metricHeaders, `keyEvents:${name}`);
      keyEventsByName[name] = at >= 0 ? metricNumber(row, at) : 0;
    }
    rows.push({
      landingPage,
      source,
      service: matchAiSource(source, extraSources),
      sessions: metricNumber(row, sessionsAt),
      users: usersAt >= 0 ? metricNumber(row, usersAt) : 0,
      keyEvents: keyEventsAt >= 0 ? metricNumber(row, keyEventsAt) : 0,
      keyEventsByName,
    });
  }
  return rows;
}

export interface AiTrafficReportInput {
  startDate: string;
  endDate: string;
  keyEventNames?: readonly string[];
  extraSources?: readonly AiSourceEntry[];
  now?: Date;
}

/** GA4 を 2 回叩いてレスポンスを組み立てる（Route Handler から呼ぶ） */
export async function fetchAiTrafficReport(
  client: Ga4Client,
  input: AiTrafficReportInput,
): Promise<AiTrafficResponse> {
  const { startDate, endDate } = input;
  const keyEventNames = sanitizeKeyEventNames(input.keyEventNames);
  const extraSources = input.extraSources ?? [];

  const [dailyReport, pageReport] = await Promise.all([
    client.runReport(buildDailyRequest(startDate, endDate)),
    client.runReport(buildPageRequest(startDate, endDate, keyEventNames, extraSources)),
  ]);

  return {
    range: { startDate, endDate },
    daily: parseDailyReport(dailyReport),
    pages: parsePageReport(pageReport, keyEventNames, extraSources),
    keyEventNames,
    fetchedAt: (input.now ?? new Date()).toISOString(),
    truncated: dailyReport.rows.length >= DAILY_ROW_LIMIT || pageReport.rows.length >= PAGE_ROW_LIMIT,
  };
}
