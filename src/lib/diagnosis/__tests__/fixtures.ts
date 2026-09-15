import type { GscDataset, KeyedMetrics, SearchMetrics } from "../types";

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
