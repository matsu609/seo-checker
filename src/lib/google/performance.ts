/**
 * Business Profile Performance API（インサイト）。サーバー専用。
 *
 * オーナー権限（business.manage）でしか取れない「Google での見られ方」を取る:
 *   - 日次の指標  GET /v1/locations/{id}:fetchMultiDailyMetricsTimeSeries
 *                 （表示回数 = マップ / 検索 × PC / モバイル、電話、サイト、ルート、予約、メッセージ）
 *   - 検索キーワード GET /v1/locations/{id}/searchkeywords/impressions/monthly
 *                 （月ごとの表示回数。少ない語は "threshold"（～15 など）で丸められて返る）
 *
 * 場所の名前は口コミ API と違い `locations/{id}`（accounts/ を付けない）。
 * データは Google 側で 2〜3 日遅れ、さかのぼれるのは 18 か月。
 * Google Cloud で「Business Profile Performance API」の有効化と、Business Profile API の
 * 利用申請の承認が要る（承認までクォータ 0 = 403）。
 * 応答の読み取りは落ちない純関数（parse*）。集計（summarize*）も純関数でテストする。
 */
import { GoogleLinkError, mapGoogleHttpError } from "./errors";
import {
  ACTION_KEYS,
  DAILY_METRICS,
  type DailyMetric,
  type DailyPoint,
  type KeywordChange,
  type MonthRow,
  type MonthlyTotals,
  type PerformanceKey,
  type PerformanceSummary,
  type SearchKeywordCount,
} from "./performance-types";
import { getGoogleTokenFor } from "./token";

export const PERFORMANCE_ENDPOINT = "https://businessprofileperformance.googleapis.com/v1";
const TIMEOUT_MS = 30_000;
const LABEL = "Google ビジネス プロフィールのインサイト";
/** さかのぼれる上限（Google の仕様） */
export const MAX_MONTHS_BACK = 18;

export {
  ACTION_KEYS,
  DAILY_METRICS,
  PERFORMANCE_KEYS,
  PERFORMANCE_LABELS,
  type DailyMetric,
  type DailyPoint,
  type KeywordChange,
  type MonthRow,
  type MonthlyTotals,
  type PerformanceKey,
  type PerformanceSummary,
  type SearchKeywordCount,
} from "./performance-types";

export interface PerformanceOptions {
  endpoint?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /** テスト用。省略時は Clerk からユーザーのトークンを取る */
  getToken?: () => Promise<string>;
}

/* ───────────── 純関数 ───────────── */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

/** "accounts/1/locations/2" でも "locations/2" でも "2" でも、Performance API の形 "locations/2" にする */
export function toPerformanceLocationName(name: string): string | null {
  const id = name.trim().split("/").filter(Boolean).pop() ?? "";
  return /^[A-Za-z0-9_-]+$/.test(id) ? `locations/${id}` : null;
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** YYYY-MM を n か月ずらす */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m! - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

/** 前の月（YYYY-MM）。Google の集計は数日遅れるので、既定の「当月」は先月にする */
export function defaultReportMonth(now = new Date()): string {
  return shiftMonth(`${now.getUTCFullYear()}-${pad2(now.getUTCMonth() + 1)}`, -1);
}

export function isMonthKey(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** その月の末日（YYYY-MM-DD） */
export function endOfMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  return `${month}-${pad2(last)}`;
}

/** fetchMultiDailyMetricsTimeSeries の URL（テストで固定する） */
export function buildDailyMetricsUrl(base: string, locationName: string, startDate: string, endDate: string): string {
  const params = new URLSearchParams();
  for (const m of DAILY_METRICS) params.append("dailyMetrics", m);
  const [sy, sm, sd] = startDate.split("-");
  const [ey, em, ed] = endDate.split("-");
  params.set("dailyRange.startDate.year", String(Number(sy)));
  params.set("dailyRange.startDate.month", String(Number(sm)));
  params.set("dailyRange.startDate.day", String(Number(sd)));
  params.set("dailyRange.endDate.year", String(Number(ey)));
  params.set("dailyRange.endDate.month", String(Number(em)));
  params.set("dailyRange.endDate.day", String(Number(ed)));
  return `${base}/${locationName}:fetchMultiDailyMetricsTimeSeries?${params.toString()}`;
}

export function buildSearchKeywordsUrl(base: string, locationName: string, month: string, pageToken: string | null = null): string {
  const [y, m] = month.split("-").map(Number);
  const params = new URLSearchParams({
    "monthlyRange.startMonth.year": String(y),
    "monthlyRange.startMonth.month": String(m),
    "monthlyRange.endMonth.year": String(y),
    "monthlyRange.endMonth.month": String(m),
    pageSize: "100",
  });
  if (pageToken) params.set("pageToken", pageToken);
  return `${base}/${locationName}/searchkeywords/impressions/monthly?${params.toString()}`;
}

/** 日次指標の応答 → 点の配列。読めない行は捨てる */
export function parseDailyMetrics(payload: unknown): DailyPoint[] {
  const out: DailyPoint[] = [];
  const root = isRecord(payload) ? payload : {};
  const multi = Array.isArray(root.multiDailyMetricTimeSeries) ? root.multiDailyMetricTimeSeries : [];
  for (const group of multi) {
    if (!isRecord(group)) continue;
    const series = Array.isArray(group.dailyMetricTimeSeries) ? group.dailyMetricTimeSeries : [];
    for (const s of series) {
      if (!isRecord(s)) continue;
      const metric = typeof s.dailyMetric === "string" ? s.dailyMetric : "";
      if (!(DAILY_METRICS as readonly string[]).includes(metric)) continue;
      const ts = isRecord(s.timeSeries) ? s.timeSeries : {};
      const values = Array.isArray(ts.datedValues) ? ts.datedValues : [];
      for (const dv of values) {
        if (!isRecord(dv) || !isRecord(dv.date)) continue;
        const y = num(dv.date.year);
        const m = num(dv.date.month);
        const d = num(dv.date.day);
        if (y === null || m === null || d === null) continue;
        // 値が無い日は Google が value を省く（= 0）
        const value = num(dv.value) ?? 0;
        out.push({ metric: metric as DailyMetric, date: `${y}-${pad2(m)}-${pad2(d)}`, value });
      }
    }
  }
  return out;
}

/** 検索キーワードの応答 → 一覧（表示回数の多い順） */
export function parseSearchKeywords(payload: unknown): { keywords: SearchKeywordCount[]; nextPageToken: string | null } {
  const root = isRecord(payload) ? payload : {};
  const list = Array.isArray(root.searchKeywordsCounts) ? root.searchKeywordsCounts : [];
  const keywords: SearchKeywordCount[] = [];
  for (const item of list) {
    if (!isRecord(item)) continue;
    const keyword = typeof item.searchKeyword === "string" ? item.searchKeyword.trim() : "";
    if (!keyword) continue;
    const iv = isRecord(item.insightsValue) ? item.insightsValue : {};
    const exact = num(iv.value);
    const threshold = num(iv.threshold);
    if (exact === null && threshold === null) continue;
    keywords.push({ keyword, impressions: exact ?? threshold ?? 0, approximate: exact === null });
  }
  keywords.sort((a, b) => b.impressions - a.impressions || a.keyword.localeCompare(b.keyword, "ja"));
  return { keywords, nextPageToken: typeof root.nextPageToken === "string" && root.nextPageToken ? root.nextPageToken : null };
}

export function emptyTotals(): MonthlyTotals {
  return { impressions: 0, impressionsMaps: 0, impressionsSearch: 0, calls: 0, websiteClicks: 0, directions: 0, conversations: 0, bookings: 0 };
}

const METRIC_TO_KEY: Record<DailyMetric, PerformanceKey> = {
  BUSINESS_IMPRESSIONS_DESKTOP_MAPS: "impressionsMaps",
  BUSINESS_IMPRESSIONS_MOBILE_MAPS: "impressionsMaps",
  BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: "impressionsSearch",
  BUSINESS_IMPRESSIONS_MOBILE_SEARCH: "impressionsSearch",
  CALL_CLICKS: "calls",
  WEBSITE_CLICKS: "websiteClicks",
  BUSINESS_DIRECTION_REQUESTS: "directions",
  BUSINESS_CONVERSATIONS: "conversations",
  BUSINESS_BOOKINGS: "bookings",
};

/** 点の配列 → 月ごとの合計（新しい月が先頭）。月の一覧は from〜to を欠けなく並べる */
export function summarizeMonthly(points: readonly DailyPoint[], fromMonth: string, toMonth: string): MonthRow[] {
  const byMonth = new Map<string, MonthRow>();
  let m = fromMonth;
  for (let guard = 0; guard < 240 && m <= toMonth; guard += 1) {
    byMonth.set(m, { month: m, totals: emptyTotals(), hasData: false });
    m = shiftMonth(m, 1);
  }
  for (const p of points) {
    const row = byMonth.get(p.date.slice(0, 7));
    if (!row) continue;
    row.hasData = true;
    const key = METRIC_TO_KEY[p.metric];
    row.totals[key] += p.value;
    if (key === "impressionsMaps" || key === "impressionsSearch") row.totals.impressions += p.value;
  }
  return [...byMonth.values()].sort((a, b) => (a.month < b.month ? 1 : -1));
}

export function actionsTotal(t: MonthlyTotals): number {
  return ACTION_KEYS.reduce((sum, k) => sum + t[k], 0);
}

/** 当月と前月のキーワードを突き合わせる。伸びた / 落ちたは両月に値がある語だけ */
export function compareKeywords(current: readonly SearchKeywordCount[], previous: readonly SearchKeywordCount[]): { keywords: KeywordChange[]; risers: KeywordChange[]; fallers: KeywordChange[] } {
  const prev = new Map(previous.map((k) => [k.keyword, k]));
  const seen = new Set<string>();
  const keywords: KeywordChange[] = [];
  for (const c of current) {
    const p = prev.get(c.keyword) ?? null;
    seen.add(c.keyword);
    keywords.push({ keyword: c.keyword, current: c.impressions, previous: p?.impressions ?? null, delta: p ? c.impressions - p.impressions : null, approximate: c.approximate || Boolean(p?.approximate) });
  }
  for (const p of previous) {
    if (seen.has(p.keyword)) continue;
    keywords.push({ keyword: p.keyword, current: null, previous: p.impressions, delta: null, approximate: p.approximate });
  }
  keywords.sort((a, b) => (b.current ?? -1) - (a.current ?? -1) || (b.previous ?? -1) - (a.previous ?? -1) || a.keyword.localeCompare(b.keyword, "ja"));
  const both = keywords.filter((k) => k.delta !== null && !k.approximate);
  const risers = [...both].filter((k) => (k.delta ?? 0) > 0).sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0)).slice(0, 3);
  const fallers = [...both].filter((k) => (k.delta ?? 0) < 0).sort((a, b) => (a.delta ?? 0) - (b.delta ?? 0)).slice(0, 3);
  return { keywords, risers, fallers };
}

export function buildPerformanceSummary(
  month: string,
  points: readonly DailyPoint[],
  currentKeywords: readonly SearchKeywordCount[],
  previousKeywords: readonly SearchKeywordCount[],
  monthsBack = MAX_MONTHS_BACK,
): PerformanceSummary {
  const previousMonth = shiftMonth(month, -1);
  const months = summarizeMonthly(points, shiftMonth(month, -(monthsBack - 1)), month);
  const current = months.find((r) => r.month === month)?.totals ?? emptyTotals();
  const previous = months.find((r) => r.month === previousMonth)?.totals ?? emptyTotals();
  const { keywords, risers, fallers } = compareKeywords(currentKeywords, previousKeywords);
  return {
    month,
    previousMonth,
    current,
    previous,
    months,
    actions: { current: actionsTotal(current), previous: actionsTotal(previous) },
    keywords,
    risers,
    fallers,
  };
}

/* ───────────── 通信 ───────────── */

/** 403 は「権限」だけでなく「API 未有効 / 利用申請が未承認」のことが多いので、案内を変える */
function mapError(status: number): GoogleLinkError {
  if (status === 403) {
    return new GoogleLinkError(
      `${LABEL}にアクセスできませんでした。Business Profile API の利用申請が承認され、Google Cloud で「Business Profile Performance API」が有効になっているか、接続した Google アカウントがそのビジネスの管理者かをご確認ください。`,
      "forbidden",
    );
  }
  if (status === 404) return new GoogleLinkError(`${LABEL}に該当するビジネスが見つかりませんでした。`, "forbidden");
  return mapGoogleHttpError(status, LABEL);
}

async function callApi(url: string, options: PerformanceOptions): Promise<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const getToken = options.getToken ?? (() => getGoogleTokenFor("business-profile"));
  const token = await getToken();
  let res: Response;
  try {
    res = await fetchImpl(url, {
      method: "GET",
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      signal: AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    throw new GoogleLinkError(timedOut ? `${LABEL}の応答がありませんでした（タイムアウト）` : `${LABEL}に接続できませんでした`, "network");
  }
  if (!res.ok) throw mapError(res.status);
  try {
    return await res.json();
  } catch {
    throw new GoogleLinkError(`${LABEL}の応答を解釈できませんでした`, "network");
  }
}

/** 日次の指標を期間ぶん取る */
export async function fetchDailyMetrics(locationName: string, startDate: string, endDate: string, options: PerformanceOptions = {}): Promise<DailyPoint[]> {
  const name = toPerformanceLocationName(locationName);
  if (!name) throw new GoogleLinkError("ビジネスの指定が正しくありません。", "not_selected");
  const base = options.endpoint ?? PERFORMANCE_ENDPOINT;
  return parseDailyMetrics(await callApi(buildDailyMetricsUrl(base, name, startDate, endDate), options));
}

/** ある月の検索キーワード（全ページ。上限 5 ページ = 500 語） */
export async function fetchSearchKeywords(locationName: string, month: string, options: PerformanceOptions = {}): Promise<SearchKeywordCount[]> {
  const name = toPerformanceLocationName(locationName);
  if (!name) throw new GoogleLinkError("ビジネスの指定が正しくありません。", "not_selected");
  const base = options.endpoint ?? PERFORMANCE_ENDPOINT;
  const all: SearchKeywordCount[] = [];
  let token: string | null = null;
  for (let page = 0; page < 5; page += 1) {
    const { keywords, nextPageToken } = parseSearchKeywords(await callApi(buildSearchKeywordsUrl(base, name, month, token), options));
    all.push(...keywords);
    if (!nextPageToken) break;
    token = nextPageToken;
  }
  return all;
}

/** 月次レポートに要るものを一式取る（日次 18 か月 + 当月と前月のキーワード = 3〜4 リクエスト） */
export async function fetchPerformanceSummary(locationName: string, month: string, options: PerformanceOptions = {}): Promise<PerformanceSummary> {
  const start = `${shiftMonth(month, -(MAX_MONTHS_BACK - 1))}-01`;
  const end = endOfMonth(month);
  const [points, currentKeywords, previousKeywords] = await Promise.all([
    fetchDailyMetrics(locationName, start, end, options),
    fetchSearchKeywords(locationName, month, options),
    fetchSearchKeywords(locationName, shiftMonth(month, -1), options),
  ]);
  return buildPerformanceSummary(month, points, currentKeywords, previousKeywords);
}
