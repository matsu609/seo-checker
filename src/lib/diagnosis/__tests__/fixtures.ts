import { buildEventMapping, unmappedEvents, type EventMapping } from "../events";
import type { Ga4Dataset, Ga4EventRow, GscDataset, KeyedMetrics, KeyedSessions, SearchMetrics, SessionMetrics } from "../types";

export const ORIGIN = "https://example.com";

export function metrics(clicks: number, impressions: number, position = 10): SearchMetrics {
  return { clicks, impressions, ctr: impressions > 0 ? clicks / impressions : 0, position };
}

export function row(key: string, clicks: number, impressions: number, position = 10): KeyedMetrics {
  return { key, ...metrics(clicks, impressions, position) };
}

/** 28 日分の日別データ。既定は毎日同じ値 */
export function days(count = 28, clicks = 10, impressions = 200, start = "2026-08-01"): KeyedMetrics[] {
  const out: KeyedMetrics[] = [];
  const base = Date.parse(`${start}T00:00:00Z`);
  for (let i = 0; i < count; i += 1) {
    const date = new Date(base + i * 86_400_000).toISOString().slice(0, 10);
    out.push(row(date, clicks, impressions));
  }
  return out;
}

export interface DatasetOverrides {
  totals?: Partial<{ current: SearchMetrics; previous: SearchMetrics }>;
  queries?: Partial<{ current: KeyedMetrics[]; previous: KeyedMetrics[] }>;
  pages?: Partial<{ current: KeyedMetrics[]; previous: KeyedMetrics[] }>;
  devices?: Partial<{ current: KeyedMetrics[]; previous: KeyedMetrics[] }>;
  countries?: Partial<{ current: KeyedMetrics[]; previous: KeyedMetrics[] }>;
  byDate?: KeyedMetrics[];
  appearances?: KeyedMetrics[] | null;
  siteUrl?: string;
  range?: GscDataset["range"];
}

/** 28 日 × 28 日で揃った、素直なデータセット */
export function dataset(over: DatasetOverrides = {}): GscDataset {
  return {
    siteUrl: over.siteUrl ?? `${ORIGIN}/`,
    range: over.range ?? {
      current: { startDate: "2026-08-01", endDate: "2026-08-28" },
      previous: { startDate: "2026-07-04", endDate: "2026-07-31" },
    },
    totals: { current: metrics(280, 5600), previous: metrics(280, 5600), ...over.totals },
    byDate: over.byDate ?? days(),
    queries: { current: [row("サンプル商事", 200, 400, 1.2), row("看板 製作 東京", 80, 5200, 12)], previous: [row("サンプル商事", 200, 400, 1.2), row("看板 製作 東京", 80, 5200, 12)], ...over.queries },
    pages: { current: [row(`${ORIGIN}/`, 200, 500, 2), row(`${ORIGIN}/service/sign`, 80, 5100, 12)], previous: [row(`${ORIGIN}/`, 200, 500, 2), row(`${ORIGIN}/service/sign`, 80, 5100, 12)], ...over.pages },
    devices: { current: [row("MOBILE", 100, 3000, 12), row("DESKTOP", 180, 2600, 8)], previous: [row("MOBILE", 100, 3000, 12), row("DESKTOP", 180, 2600, 8)], ...over.devices },
    countries: { current: [row("jpn", 280, 5600, 10)], previous: [row("jpn", 280, 5600, 10)], ...over.countries },
    appearances: over.appearances === undefined ? null : over.appearances,
    notes: [],
  };
}


/* ───────────── GA4 ───────────── */

export function sessions(key: string, n: number, over: Partial<SessionMetrics> = {}): KeyedSessions {
  return {
    key,
    sessions: n,
    users: Math.round(n * 0.8),
    newUsers: Math.round(n * 0.5),
    engagedSessions: Math.round(n * 0.6),
    keyEvents: 0,
    engagementSeconds: 45,
    ...over,
  };
}

export function event(name: string, over: Partial<Ga4EventRow> = {}): Ga4EventRow {
  return { name, count: 100, users: 80, sessions: 90, keyEvents: 0, ...over };
}

export interface Ga4Overrides {
  channels?: Partial<{ current: KeyedSessions[]; previous: KeyedSessions[] }>;
  landing?: Partial<{ current: KeyedSessions[]; previous: KeyedSessions[] }>;
  devices?: Partial<{ current: KeyedSessions[]; previous: KeyedSessions[] }>;
  sources?: KeyedSessions[];
  pages?: Ga4Dataset["pages"];
  events?: Ga4EventRow[];
  channelEvents?: Ga4Dataset["channelEvents"];
  mappingOverrides?: Partial<EventMapping>;
}

/** 素直な GA4 データ（問い合わせ導線が一通り計測されている状態） */
export function ga4Dataset(over: Ga4Overrides = {}): Ga4Dataset {
  const channels = over.channels?.current ?? [sessions("Organic Search", 600), sessions("Direct", 250), sessions("Referral", 150)];
  const channelsPrev = over.channels?.previous ?? [sessions("Organic Search", 600), sessions("Direct", 250), sessions("Referral", 150)];
  const events = over.events ?? [
    event("page_view", { count: 3000, sessions: 1000 }),
    event("contact_click", { count: 60, sessions: 50 }),
    event("form_start", { count: 30, sessions: 28 }),
    event("generate_lead", { count: 12, sessions: 12, keyEvents: 12 }),
  ];
  const names = events.map((e) => e.name);
  const mapping = buildEventMapping(names, over.mappingOverrides);
  const total = (rows: KeyedSessions[]): SessionMetrics => {
    let s = 0;
    let u = 0;
    let nu = 0;
    let e = 0;
    let k = 0;
    for (const r of rows) {
      s += r.sessions;
      u += r.users;
      nu += r.newUsers;
      e += r.engagedSessions;
      k += r.keyEvents;
    }
    return { sessions: s, users: u, newUsers: nu, engagedSessions: e, keyEvents: k, engagementSeconds: 45 };
  };
  return {
    propertyId: "123456",
    range: { current: { startDate: "2026-08-01", endDate: "2026-08-28" }, previous: { startDate: "2026-07-04", endDate: "2026-07-31" } },
    totals: { current: total(channels), previous: total(channelsPrev) },
    channels: { current: channels, previous: channelsPrev },
    sources: over.sources ?? [sessions("google / organic", 600), sessions("(direct) / (none)", 250)],
    landing: {
      current: over.landing?.current ?? [sessions("/", 500), sessions("/service/sign", 300), sessions("/blog/post-1", 200)],
      previous: over.landing?.previous ?? [sessions("/", 500), sessions("/service/sign", 300), sessions("/blog/post-1", 200)],
    },
    pages: over.pages ?? [
      { path: "/", title: "トップ", views: 900, users: 700, engagementSeconds: 40 },
      { path: "/service/sign", title: "看板製作", views: 600, users: 450, engagementSeconds: 90 },
    ],
    events,
    channelEvents: over.channelEvents ?? [{ channel: "Organic Search", event: "generate_lead", sessions: 8 }],
    devices: {
      current: over.devices?.current ?? [sessions("mobile", 500), sessions("desktop", 500)],
      previous: over.devices?.previous ?? [sessions("mobile", 500), sessions("desktop", 500)],
    },
    mapping,
    unmapped: unmappedEvents(names, mapping),
    notes: [],
  };
}
