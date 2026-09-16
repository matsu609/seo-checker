/**
 * GA4 からの取り込み（docs/dev/diagnosis-rules-spec.md §4.2）。サーバー専用。
 *
 * 取るのは 4 種類（トラフィック獲得 / ランディングページ / ページ・スクリーン /
 * イベント）とデバイス、それにチャネル × イベント。当期と前期を同じ日数で取る。
 *
 * 注意している点:
 * - **セッション単位とユーザー単位を混ぜない**（§9.5 M09）。ここで取るのは
 *   すべてセッション単位で、ユーザー数は参考として並べるだけ。
 * - エンゲージメント率は行ごとの値を平均せず、`engagedSessions ÷ sessions` で出す。
 * - 「そのイベントが起きたセッション数」は eventName × sessions で取る。1 セッションで
 *   同じイベントが何度起きても 1 と数えられるため、イベント数とは別物として扱う。
 * - 失敗しても例外を投げず null を返す（報告書全体を止めない）。
 */
import { dimensionValue, headerIndex, metricNumber, previousRange, rangeForDays, type Ga4Client, type Ga4Report } from "@/lib/ga4";
import { buildEventMapping, unmappedEvents, type EventMapping } from "../events";
import type { Ga4Dataset, Ga4EventRow, Ga4PageRow, KeyedSessions, SessionMetrics } from "../types";

/** GSC と揃える（比較のため）。GA4 は前日まで確定しているが、期間の長さは同じにする */
export const GA4_DIAGNOSIS_DAYS = 28;
const ROW_LIMIT = 300;
const SMALL_LIMIT = 50;

const SESSION_METRICS = [{ name: "sessions" }, { name: "totalUsers" }, { name: "newUsers" }, { name: "engagedSessions" }, { name: "keyEvents" }, { name: "userEngagementDuration" }];

function emptySessionMetrics(): SessionMetrics {
  return { sessions: 0, users: 0, newUsers: 0, engagedSessions: 0, keyEvents: 0, engagementSeconds: 0 };
}

/** セッション指標の行を読む。列の並びはヘッダーから引く（順番に依存しない） */
function readSessions(report: Ga4Report): KeyedSessions[] {
  const at = {
    sessions: headerIndex(report.metricHeaders, "sessions"),
    users: headerIndex(report.metricHeaders, "totalUsers"),
    newUsers: headerIndex(report.metricHeaders, "newUsers"),
    engaged: headerIndex(report.metricHeaders, "engagedSessions"),
    keyEvents: headerIndex(report.metricHeaders, "keyEvents"),
    duration: headerIndex(report.metricHeaders, "userEngagementDuration"),
  };
  return report.rows.map((row) => {
    const sessions = metricNumber(row, at.sessions);
    return {
      key: dimensionValue(row, 0),
      sessions,
      users: metricNumber(row, at.users),
      newUsers: metricNumber(row, at.newUsers),
      engagedSessions: metricNumber(row, at.engaged),
      keyEvents: metricNumber(row, at.keyEvents),
      // userEngagementDuration は合計秒。1 セッションあたりに直す
      engagementSeconds: sessions > 0 ? metricNumber(row, at.duration) / sessions : 0,
    };
  });
}

/** 行をすべて足す（サイト全体の合計。行ごとの率を平均しない） */
export function sumSessions(rows: readonly KeyedSessions[]): SessionMetrics {
  const total = emptySessionMetrics();
  let weighted = 0;
  for (const r of rows) {
    total.sessions += r.sessions;
    total.users += r.users;
    total.newUsers += r.newUsers;
    total.engagedSessions += r.engagedSessions;
    total.keyEvents += r.keyEvents;
    weighted += r.engagementSeconds * r.sessions;
  }
  total.engagementSeconds = total.sessions > 0 ? weighted / total.sessions : 0;
  return total;
}

export interface CollectGa4Options {
  days?: number;
  now?: Date;
  /** 設定画面で人が直したイベントの対応表 */
  mappingOverrides?: Partial<EventMapping>;
}

export async function collectGa4Dataset(
  client: Ga4Client,
  options: CollectGa4Options = {},
): Promise<{ dataset: Ga4Dataset | null; notes: string[] }> {
  const notes: string[] = [];
  const days = options.days ?? GA4_DIAGNOSIS_DAYS;
  const current = rangeForDays(days, options.now);
  const previous = previousRange(current);

  const sessionsBy = (dimension: string, range: { startDate: string; endDate: string }, limit: number) =>
    client.runReport({
      dateRanges: [range],
      dimensions: [{ name: dimension }],
      metrics: SESSION_METRICS,
      orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
      limit,
    });

  try {
    const [channels, channelsPrev, sources, landing, landingPrev, pages, events, devices, devicesPrev, countries, channelEvents] = await Promise.all([
      sessionsBy("sessionDefaultChannelGroup", current, SMALL_LIMIT),
      sessionsBy("sessionDefaultChannelGroup", previous, SMALL_LIMIT),
      sessionsBy("sessionSourceMedium", current, SMALL_LIMIT),
      sessionsBy("landingPage", current, ROW_LIMIT),
      sessionsBy("landingPage", previous, ROW_LIMIT),
      client.runReport({
        dateRanges: [current],
        dimensions: [{ name: "pagePath" }, { name: "pageTitle" }],
        metrics: [{ name: "screenPageViews" }, { name: "totalUsers" }, { name: "userEngagementDuration" }],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit: ROW_LIMIT,
      }),
      client.runReport({
        dateRanges: [current],
        dimensions: [{ name: "eventName" }],
        metrics: [{ name: "eventCount" }, { name: "totalUsers" }, { name: "sessions" }, { name: "keyEvents" }],
        orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
        limit: ROW_LIMIT,
      }),
      sessionsBy("deviceCategory", current, SMALL_LIMIT),
      sessionsBy("deviceCategory", previous, SMALL_LIMIT),
      sessionsBy("country", current, SMALL_LIMIT),
      client.runReport({
        dateRanges: [current],
        dimensions: [{ name: "sessionDefaultChannelGroup" }, { name: "eventName" }],
        metrics: [{ name: "sessions" }],
        orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
        limit: ROW_LIMIT,
      }),
    ]);

    const eventRows: Ga4EventRow[] = (() => {
      const at = {
        count: headerIndex(events.metricHeaders, "eventCount"),
        users: headerIndex(events.metricHeaders, "totalUsers"),
        sessions: headerIndex(events.metricHeaders, "sessions"),
        keyEvents: headerIndex(events.metricHeaders, "keyEvents"),
      };
      return events.rows.map((row) => ({
        name: dimensionValue(row, 0),
        count: metricNumber(row, at.count),
        users: metricNumber(row, at.users),
        sessions: metricNumber(row, at.sessions),
        keyEvents: metricNumber(row, at.keyEvents),
      }));
    })();

    const pageRows: Ga4PageRow[] = (() => {
      const at = {
        views: headerIndex(pages.metricHeaders, "screenPageViews"),
        users: headerIndex(pages.metricHeaders, "totalUsers"),
        duration: headerIndex(pages.metricHeaders, "userEngagementDuration"),
      };
      return pages.rows.map((row) => {
        const users = metricNumber(row, at.users);
        return {
          path: dimensionValue(row, 0),
          title: dimensionValue(row, 1),
          views: metricNumber(row, at.views),
          users,
          engagementSeconds: users > 0 ? metricNumber(row, at.duration) / users : 0,
        };
      });
    })();

    const names = eventRows.map((e) => e.name);
    const mapping = buildEventMapping(names, options.mappingOverrides);
    const unmapped = unmappedEvents(names, mapping);

    const channelEventRows = (() => {
      const at = headerIndex(channelEvents.metricHeaders, "sessions");
      return channelEvents.rows.map((row) => ({ channel: dimensionValue(row, 0), event: dimensionValue(row, 1), sessions: metricNumber(row, at) }));
    })();

    if (eventRows.length === 0) notes.push("GA4 のイベントが 1 件も返りませんでした（計測が動いていない可能性）");
    if (unmapped.length > 0) notes.push(`共通イベントに当てはまらなかったイベント名が ${unmapped.length} 件あります（設定画面で割り当てられます）`);

    const channelRows = readSessions(channels);
    const channelRowsPrev = readSessions(channelsPrev);

    return {
      dataset: {
        propertyId: client.propertyId,
        range: { current, previous },
        totals: { current: sumSessions(channelRows), previous: sumSessions(channelRowsPrev) },
        channels: { current: channelRows, previous: channelRowsPrev },
        sources: readSessions(sources),
        landing: { current: readSessions(landing), previous: readSessions(landingPrev) },
        pages: pageRows,
        events: eventRows,
        channelEvents: channelEventRows,
        devices: { current: readSessions(devices), previous: readSessions(devicesPrev) },
        countries: readSessions(countries),
        mapping,
        unmapped,
        notes,
      },
      notes,
    };
  } catch (err) {
    notes.push(`GA4 のデータを取得できませんでした（${err instanceof Error ? err.message : "エラー"}）`);
    return { dataset: null, notes };
  }
}
