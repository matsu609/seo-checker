/**
 * 生のイベント行から報告書を組み立てる。純粋関数（I/O なし。テストで固定する）。
 *
 * セッション = 同じ訪問者のページビューを時刻順に並べ、30 分以上あいたら別のセッション。
 * セッションの流入元は最初のページビューの channel（internal は「直前のセッションの続き」なので direct に倒す）。
 * CV（電話・メール・外部・フォーム）は、同じ訪問者の、そのセッションの範囲（最後のページビュー + 30 分まで）に入るものを数える。
 */
import type { AnalyticsReport, Channel, ChannelStat, ConversionKind, DailyPoint, PageStat, SourceStat, Totals, TrackingRow } from "./types";

export const SESSION_GAP_MS = 30 * 60 * 1000;
const TOP_PAGES = 20;
const TOP_SOURCES = 10;

const CHANNEL_ORDER: readonly Channel[] = ["search", "ai", "social", "ad", "referral", "direct"];

interface Session {
  visitor: string;
  start: number;
  end: number;
  day: string;
  channel: Channel;
  source: string;
  pageviews: number;
  conversions: Set<string>;
  device: string;
}

function emptyConversions(): Record<ConversionKind, number> {
  return { tel: 0, mail: 0, external: 0, form: 0 };
}

export function emptyTotals(): Totals {
  return { visitors: 0, sessions: 0, pageviews: 0, avgSeconds: null, convertedSessions: 0, conversions: emptyConversions(), aiSessions: 0 };
}

function conversionKind(row: TrackingRow): ConversionKind | null {
  if (row.type === "form") return "form";
  if (row.type === "click" && (row.kind === "tel" || row.kind === "mail" || row.kind === "external")) return row.kind;
  return null;
}

/** ページビューをセッションに束ねる */
export function buildSessions(rows: readonly TrackingRow[]): Session[] {
  const byVisitor = new Map<string, TrackingRow[]>();
  for (const row of rows) {
    if (row.type !== "pageview") continue;
    const list = byVisitor.get(row.visitor) ?? [];
    list.push(row);
    byVisitor.set(row.visitor, list);
  }
  const sessions: Session[] = [];
  for (const [visitor, views] of byVisitor) {
    views.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
    let current: Session | null = null;
    for (const v of views) {
      const t = Date.parse(v.ts);
      if (!current || t - current.end > SESSION_GAP_MS) {
        current = {
          visitor,
          start: t,
          end: t,
          day: v.day,
          channel: v.channel === "internal" ? "direct" : v.channel,
          source: v.channel === "internal" ? "" : v.source,
          pageviews: 0,
          conversions: new Set(),
          device: v.device,
        };
        sessions.push(current);
      }
      current.end = t;
      current.pageviews += 1;
    }
  }
  // CV をセッションに割り当てる
  const byVisitorSessions = new Map<string, Session[]>();
  for (const s of sessions) {
    const list = byVisitorSessions.get(s.visitor) ?? [];
    list.push(s);
    byVisitorSessions.set(s.visitor, list);
  }
  for (const row of rows) {
    const kind = conversionKind(row);
    if (!kind) continue;
    const t = Date.parse(row.ts);
    const candidates = byVisitorSessions.get(row.visitor) ?? [];
    const session = candidates.find((s) => t >= s.start - 1000 && t <= s.end + SESSION_GAP_MS);
    if (session) session.conversions.add(kind);
  }
  return sessions;
}

function totalsOf(rows: readonly TrackingRow[], sessions: readonly Session[]): Totals {
  const totals = emptyTotals();
  totals.visitors = new Set(rows.filter((r) => r.type === "pageview").map((r) => r.visitor)).size;
  totals.sessions = sessions.length;
  totals.pageviews = rows.filter((r) => r.type === "pageview").length;
  const seconds = rows.filter((r) => r.type === "leave" && r.seconds > 0).map((r) => Math.min(r.seconds, 1800));
  totals.avgSeconds = seconds.length ? Math.round(seconds.reduce((a, b) => a + b, 0) / seconds.length) : null;
  for (const row of rows) {
    const kind = conversionKind(row);
    if (kind) totals.conversions[kind] += 1;
  }
  totals.convertedSessions = sessions.filter((s) => s.conversions.size > 0).length;
  totals.aiSessions = sessions.filter((s) => s.channel === "ai").length;
  return totals;
}

/** from〜to（両端含む、YYYY-MM-DD）の日付一覧 */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  const start = new Date(`${from}T00:00:00Z`).getTime();
  const end = new Date(`${to}T00:00:00Z`).getTime();
  for (let t = start; t <= end; t += 24 * 60 * 60 * 1000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

/** 日付を n 日ずらす（YYYY-MM-DD） */
export function shiftDay(day: string, delta: number): string {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() + delta * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function dailyOf(rows: readonly TrackingRow[], sessions: readonly Session[], days: readonly string[]): DailyPoint[] {
  const map = new Map<string, DailyPoint>(days.map((d) => [d, { day: d, visitors: 0, sessions: 0, pageviews: 0, conversions: 0 }]));
  const visitorsByDay = new Map<string, Set<string>>();
  for (const row of rows) {
    const point = map.get(row.day);
    if (!point) continue;
    if (row.type === "pageview") {
      point.pageviews += 1;
      const set = visitorsByDay.get(row.day) ?? new Set<string>();
      set.add(row.visitor);
      visitorsByDay.set(row.day, set);
    } else if (conversionKind(row)) {
      point.conversions += 1;
    }
  }
  for (const s of sessions) {
    const point = map.get(s.day);
    if (point) point.sessions += 1;
  }
  for (const [day, set] of visitorsByDay) {
    const point = map.get(day);
    if (point) point.visitors = set.size;
  }
  return [...map.values()];
}

function pagesOf(rows: readonly TrackingRow[]): PageStat[] {
  const map = new Map<string, { pageviews: number; visitors: Set<string>; seconds: number[]; conversions: number }>();
  const get = (path: string) => {
    const cur = map.get(path) ?? { pageviews: 0, visitors: new Set<string>(), seconds: [], conversions: 0 };
    map.set(path, cur);
    return cur;
  };
  for (const row of rows) {
    if (row.type === "pageview") {
      const p = get(row.path);
      p.pageviews += 1;
      p.visitors.add(row.visitor);
    } else if (row.type === "leave" && row.seconds > 0) {
      get(row.path).seconds.push(Math.min(row.seconds, 1800));
    } else if (conversionKind(row)) {
      get(row.path).conversions += 1;
    }
  }
  return [...map.entries()]
    .filter(([, v]) => v.pageviews > 0)
    .map(([path, v]) => ({
      path,
      pageviews: v.pageviews,
      visitors: v.visitors.size,
      avgSeconds: v.seconds.length ? Math.round(v.seconds.reduce((a, b) => a + b, 0) / v.seconds.length) : null,
      conversions: v.conversions,
    }))
    .sort((a, b) => b.pageviews - a.pageviews || a.path.localeCompare(b.path))
    .slice(0, TOP_PAGES);
}

function channelsOf(sessions: readonly Session[]): ChannelStat[] {
  const total = sessions.length;
  return CHANNEL_ORDER.map((channel) => {
    const own = sessions.filter((s) => s.channel === channel);
    return {
      channel,
      sessions: own.length,
      share: total ? own.length / total : 0,
      conversions: own.filter((s) => s.conversions.size > 0).length,
    };
  }).filter((c) => c.sessions > 0);
}

function sourcesOf(sessions: readonly Session[], channel: Channel): SourceStat[] {
  const map = new Map<string, number>();
  for (const s of sessions) {
    if (s.channel !== channel || !s.source) continue;
    map.set(s.source, (map.get(s.source) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([name, sessions]) => ({ name, sessions }))
    .sort((a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name))
    .slice(0, TOP_SOURCES);
}

export interface BuildReportArgs {
  /** 対象期間の行 */
  rows: readonly TrackingRow[];
  /** 比較用（直前の同じ長さの期間）の行 */
  previousRows: readonly TrackingRow[];
  from: string;
  to: string;
}

export function buildReport({ rows, previousRows, from, to }: BuildReportArgs): AnalyticsReport {
  const days = daysBetween(from, to);
  const sessions = buildSessions(rows);
  const previousSessions = buildSessions(previousRows);
  const previousTo = shiftDay(from, -1);
  const previousFrom = shiftDay(previousTo, -(days.length - 1));
  const devices = { mobile: 0, desktop: 0 };
  for (const s of sessions) {
    if (s.device === "mobile") devices.mobile += 1;
    else devices.desktop += 1;
  }
  return {
    range: { from, to, days: days.length },
    previousRange: { from: previousFrom, to: previousTo },
    totals: totalsOf(rows, sessions),
    previous: totalsOf(previousRows, previousSessions),
    daily: dailyOf(rows, sessions, days),
    pages: pagesOf(rows),
    channels: channelsOf(sessions),
    aiSources: sourcesOf(sessions, "ai"),
    referrers: sourcesOf(sessions, "referral"),
    devices,
  };
}
