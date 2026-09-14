/**
 * CrUX API の応答 → アプリ側の型（純関数）。
 */
import {
  CRUX_THRESHOLDS,
  type CruxHistory,
  type CruxHistoryPoint,
  type CruxMetricId,
  type CruxMetricValue,
  type CruxRecord,
  type CruxStatus,
} from "./types";

/** API の metrics のキー → アプリ側の ID */
const METRIC_KEYS: Record<string, CruxMetricId> = {
  largest_contentful_paint: "lcp",
  interaction_to_next_paint: "inp",
  cumulative_layout_shift: "cls",
  first_contentful_paint: "fcp",
  experimental_time_to_first_byte: "ttfb",
};

type Json = Record<string, unknown>;

function isRecord(v: unknown): v is Json {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

/** 数値でも文字列（CLS は "0.05" のように文字列で返る）でも読む */
function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function statusOf(metric: CruxMetricId, p75: number): CruxStatus {
  const t = CRUX_THRESHOLDS[metric];
  if (p75 <= t.good) return "good";
  if (p75 > t.poor) return "poor";
  return "needs-improvement";
}

function dateOf(v: unknown): string {
  if (!isRecord(v)) return "";
  const y = num(v.year);
  const m = num(v.month);
  const d = num(v.day);
  if (y === null || m === null || d === null) return "";
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function parseMetric(metric: CruxMetricId, raw: unknown): CruxMetricValue | null {
  if (!isRecord(raw)) return null;
  const p75 = isRecord(raw.percentiles) ? num(raw.percentiles.p75) : null;
  if (p75 === null) return null;
  const bins = Array.isArray(raw.histogram) ? raw.histogram : [];
  const densities = bins.map((b) => (isRecord(b) ? (num(b.density) ?? 0) : 0));
  const histogram: [number, number, number] = [densities[0] ?? 0, densities[1] ?? 0, densities[2] ?? 0];
  return { p75, status: statusOf(metric, p75), histogram };
}

export function parseCruxRecord(payload: unknown): CruxRecord | null {
  if (!isRecord(payload) || !isRecord(payload.record)) return null;
  const record = payload.record;
  const key = isRecord(record.key) ? record.key : {};
  const scope: "url" | "origin" = typeof key.url === "string" ? "url" : "origin";
  const keyValue = typeof key.url === "string" ? key.url : typeof key.origin === "string" ? key.origin : "";
  const rawMetrics = isRecord(record.metrics) ? record.metrics : {};
  const metrics: CruxRecord["metrics"] = {};
  for (const [apiKey, id] of Object.entries(METRIC_KEYS)) {
    const parsed = parseMetric(id, rawMetrics[apiKey]);
    if (parsed) metrics[id] = parsed;
  }
  const period = isRecord(record.collectionPeriod) ? record.collectionPeriod : {};
  const core = [metrics.lcp, metrics.inp, metrics.cls];
  const passesCoreWebVitals = core.every(Boolean) ? core.every((m) => m?.status === "good") : null;
  return {
    scope,
    key: keyValue,
    period: { firstDate: dateOf(period.firstDate), lastDate: dateOf(period.lastDate) },
    metrics,
    passesCoreWebVitals,
  };
}

export function parseCruxHistory(payload: unknown): CruxHistory | null {
  if (!isRecord(payload) || !isRecord(payload.record)) return null;
  const record = payload.record;
  const key = isRecord(record.key) ? record.key : {};
  const scope: "url" | "origin" = typeof key.url === "string" ? "url" : "origin";
  const keyValue = typeof key.url === "string" ? key.url : typeof key.origin === "string" ? key.origin : "";
  const periods = Array.isArray(record.collectionPeriods) ? record.collectionPeriods : [];
  const dates = periods.map((p) => (isRecord(p) ? dateOf(p.lastDate) : ""));
  const rawMetrics = isRecord(record.metrics) ? record.metrics : {};
  const metrics: CruxHistory["metrics"] = {};
  for (const [apiKey, id] of Object.entries(METRIC_KEYS)) {
    const m = rawMetrics[apiKey];
    if (!isRecord(m) || !isRecord(m.percentilesTimeseries)) continue;
    const p75s = Array.isArray(m.percentilesTimeseries.p75s) ? m.percentilesTimeseries.p75s : [];
    const points: CruxHistoryPoint[] = dates.map((date, i) => ({ date, p75: num(p75s[i]) }));
    if (points.some((p) => p.p75 !== null)) metrics[id] = points;
  }
  return { scope, key: keyValue, metrics };
}

/** 推移の要約: 最初と最後の有効な値。片方しか無ければ null */
export function trendOf(points: readonly CruxHistoryPoint[] | undefined): { first: number; last: number; firstDate: string; lastDate: string } | null {
  if (!points) return null;
  const valid = points.filter((p) => p.p75 !== null);
  if (valid.length < 2) return null;
  const first = valid[0];
  const last = valid[valid.length - 1];
  return { first: first.p75 as number, last: last.p75 as number, firstDate: first.date, lastDate: last.date };
}

/** 表示用: ミリ秒は秒 1 桁、CLS は小数 2 桁 */
export function formatCrux(metric: CruxMetricId, value: number): string {
  if (metric === "cls") return value.toFixed(2);
  return `${(value / 1000).toFixed(1)} 秒`;
}
