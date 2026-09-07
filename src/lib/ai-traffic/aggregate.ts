/**
 * 生成 AI 流入の集計（純関数。ネットワークにも localStorage にも触らない）。
 *
 * 画面は「期間・比較単位・指標」を決めるだけで、バケット分け・率の計算は
 * ここに任せる（グラフ・表・CSV が同じ数字になるようにするため）。
 * 日付は UTC で計算する（ローカルタイムゾーンで月境界がずれるのを避ける）。
 */
import { matchAiSource, type AiSourceEntry } from "@/lib/ga4/ai-sources";
import {
  ORGANIC_SEARCH_CHANNEL,
  type AiTrafficDailyRow,
  type AiTrafficPageRow,
  type Granularity,
  type TrafficMetric,
} from "./types";

/* ───────────── 日付 ───────────── */

/**
 * GA4 の "20260901" / "2026-09-01" → "2026-09-01"。読めなければ空文字。
 *
 * 桁数だけを見て組み替えると "20260229"（閏年でない 2 月 29 日）のような
 * 存在しない日付が通ってしまう。Date.UTC はこれを 3 月 1 日へ繰り上げるため、
 * バケットのキー（元の文字列）とラベル（繰り上げ後の日付）が食い違う。
 * 実在する日付かどうかまで確かめる。
 */
export function toIsoDate(raw: string): string {
  const s = (raw ?? "").trim();
  const iso = /^\d{8}$/.test(s)
    ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
    : /^\d{4}-\d{2}-\d{2}$/.test(s)
      ? s
      : "";
  if (!iso) return "";
  // 繰り上げが起きたら実在しない日付だったということ
  const [y, mo, d] = iso.split("-").map(Number);
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (
    probe.getUTCFullYear() !== y ||
    probe.getUTCMonth() !== mo - 1 ||
    probe.getUTCDate() !== d
  ) {
    return "";
  }
  return iso;
}

function toUtc(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

function isoOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

export interface Bucket {
  /** 並び替えに使うキー（day / week は YYYY-MM-DD、month は YYYY-MM） */
  key: string;
  /** x 軸に出すラベル */
  label: string;
}

/**
 * 日付 → バケット。週は月曜始まり（§19）、ラベルは「4/1-4/7」形式。
 * 月をまたぐ週も 1 つのバケットにまとまる（例: 3/30-4/5）。
 */
export function bucketOf(isoDate: string, granularity: Granularity): Bucket | null {
  const iso = toIsoDate(isoDate);
  const d = toUtc(iso);
  if (!d) return null;
  if (granularity === "day") {
    return { key: iso, label: `${d.getUTCMonth() + 1}/${d.getUTCDate()}` };
  }
  if (granularity === "month") {
    const key = iso.slice(0, 7);
    return { key, label: `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}` };
  }
  // 週: 月曜始まり（getUTCDay は日曜が 0）
  const offset = (d.getUTCDay() + 6) % 7;
  const monday = addDays(d, -offset);
  const sunday = addDays(monday, 6);
  return {
    key: isoOf(monday),
    label: `${monday.getUTCMonth() + 1}/${monday.getUTCDate()}-${sunday.getUTCMonth() + 1}/${sunday.getUTCDate()}`,
  };
}

/* ───────────── 率 ───────────── */

/**
 * 割合（0〜1）。分母が 0 のときは 0 ではなく null を返す
 * （「0%」と「計算できない」を画面で区別するため）。
 */
export function ratio(part: number, total: number): number | null {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return null;
  return part / total;
}

/** 率の表示。null は「—」 */
export function formatRatio(value: number | null, digits = 1): string {
  if (value === null) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

/* ───────────── バケット集計 ───────────── */

export interface TrafficBucket extends Bucket {
  /** 全セッション（または全ユーザー） */
  total: number;
  /** 自然検索（sessionDefaultChannelGroup = "Organic Search"）。AI と重なる分も含む */
  organic: number;
  /** AI 検索（参照元辞書に一致） */
  ai: number;
  /**
   * 自然検索かつ AI（GA4 が一部の AI 参照元を Organic Search に入れるため重なる）。
   * 積み上げ棒で同じセッションを 2 回描かないよう、重なりをここに持つ。
   */
  organicAi: number;
  /** organic − organicAi（積み上げ棒の「自然検索」。AI と重なる分を除いた値） */
  organicOnly: number;
  /** total − organicOnly − ai（積み上げ棒の「その他」。負にはしない） */
  other: number;
  /** AI 検索率（対総セッション） */
  aiRateTotal: number | null;
  /** AI 検索率（対自然検索） */
  aiRateOrganic: number | null;
  /** サービス名 → 値 */
  byService: Record<string, number>;
}

export interface AggregateOptions {
  granularity: Granularity;
  metric: TrafficMetric;
  extraSources?: readonly AiSourceEntry[];
}

/**
 * 行から指標の値を取り出す。
 *
 * 注意: GA4 の totalUsers は行ごとに重複が除かれた値なので、
 * 日 × 参照元 × チャネル の行を足し合わせても「実ユーザー数」にはならない
 * （同じ人が 2 つの参照元から来ると 2 と数える）。合算した値は延べ人数であり、
 * 画面のラベルでもそのように示している（METRIC_LABELS）。
 */
function valueOf(row: AiTrafficDailyRow, metric: TrafficMetric): number {
  const raw = metric === "users" ? row.users : row.sessions;
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

/**
 * 素の行（日 × 参照元 × チャネル）→ バケットごとの 3 系列 + 2 つの率 + サービス別。
 * 行の順序は問わない（キーで並べ直す）。日付が読めない行は捨てる。
 */
export function aggregateTraffic(
  rows: readonly AiTrafficDailyRow[],
  options: AggregateOptions,
): TrafficBucket[] {
  const { granularity, metric, extraSources = [] } = options;
  const map = new Map<string, TrafficBucket>();

  for (const row of rows) {
    const bucket = bucketOf(row.date, granularity);
    if (!bucket) continue;
    const value = valueOf(row, metric);
    let entry = map.get(bucket.key);
    if (!entry) {
      entry = {
        ...bucket,
        total: 0,
        organic: 0,
        ai: 0,
        organicAi: 0,
        organicOnly: 0,
        other: 0,
        aiRateTotal: null,
        aiRateOrganic: null,
        byService: {},
      };
      map.set(bucket.key, entry);
    }
    entry.total += value;
    const organic = row.channel === ORGANIC_SEARCH_CHANNEL;
    if (organic) entry.organic += value;
    const service = matchAiSource(row.source, extraSources);
    if (service !== null) {
      entry.ai += value;
      // 同じ行が自然検索にも AI にも数えられた分（積み上げの二重計上を防ぐために持つ）
      if (organic) entry.organicAi += value;
      entry.byService[service] = (entry.byService[service] ?? 0) + value;
    }
  }

  return Array.from(map.values())
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((b) => {
      const organicOnly = Math.max(0, b.organic - b.organicAi);
      return {
        ...b,
        organicOnly,
        // 積み上げ（ai + organicOnly + other）の合計が total を超えないよう、
        // 重なり分を引いた自然検索で残りを出す
        other: Math.max(0, b.total - organicOnly - b.ai),
        aiRateTotal: ratio(b.ai, b.total),
        aiRateOrganic: ratio(b.ai, b.organic),
      };
    });
}

export interface TrafficTotals {
  total: number;
  organic: number;
  ai: number;
  /** 自然検索に分類された AI 流入（重なり）。注記に出す */
  organicAi: number;
  aiRateTotal: number | null;
  aiRateOrganic: number | null;
  /** サービス名 → 合計（多い順） */
  services: Array<{ service: string; value: number; share: number | null }>;
}

/** 期間全体の合計（KPI ストリップ用） */
export function totalsOf(buckets: readonly TrafficBucket[]): TrafficTotals {
  let total = 0;
  let organic = 0;
  let ai = 0;
  let organicAi = 0;
  const byService = new Map<string, number>();
  for (const b of buckets) {
    total += b.total;
    organic += b.organic;
    ai += b.ai;
    organicAi += b.organicAi;
    for (const [service, value] of Object.entries(b.byService)) {
      byService.set(service, (byService.get(service) ?? 0) + value);
    }
  }
  const services = Array.from(byService.entries())
    .map(([service, value]) => ({ service, value, share: ratio(value, ai) }))
    .sort((a, b) => b.value - a.value || a.service.localeCompare(b.service, "ja"));
  return {
    total,
    organic,
    ai,
    organicAi,
    aiRateTotal: ratio(ai, total),
    aiRateOrganic: ratio(ai, organic),
    services,
  };
}

/**
 * 積み上げ棒に出すサービスを絞る。max 件を超えた分は「その他」にまとめる
 * （palette.chart が 6 色しか無いので、色を使い回して混乱させない）。
 */
export const OTHER_SERVICE_LABEL = "その他の AI";

export function topServices(buckets: readonly TrafficBucket[], max = 5): string[] {
  const ranked = totalsOf(buckets).services.map((s) => s.service);
  if (ranked.length <= max) return ranked;
  return [...ranked.slice(0, max), OTHER_SERVICE_LABEL];
}

/** バケット × サービス名 → 値（topServices と組で使う。「その他の AI」は残り全部の合計） */
export function serviceValues(
  bucket: TrafficBucket,
  services: readonly string[],
): number[] {
  return services.map((service) => {
    if (service !== OTHER_SERVICE_LABEL) return bucket.byService[service] ?? 0;
    let rest = 0;
    for (const [name, value] of Object.entries(bucket.byService)) {
      if (!services.includes(name)) rest += value;
    }
    return rest;
  });
}

/* ───────────── ページ × 流入元 × キーイベント ───────────── */

/** 1 行のキーイベント件数。名前を指定しなければ合計 */
export function keyEventCount(row: AiTrafficPageRow, keyEventName?: string | null): number {
  if (!keyEventName) return row.keyEvents;
  return row.keyEventsByName[keyEventName] ?? 0;
}

export interface PageFilterOptions {
  /** このキーイベント名で絞る（未指定なら合計で見る） */
  keyEventName?: string | null;
  /** キーイベントが 1 件以上ある行だけにする */
  onlyWithKeyEvents?: boolean;
  /** サービス名で絞る */
  service?: string | null;
}

/** ページ表の絞り込み（並び替えは DataTable 側） */
export function filterPageRows(
  rows: readonly AiTrafficPageRow[],
  options: PageFilterOptions = {},
): AiTrafficPageRow[] {
  const { keyEventName = null, onlyWithKeyEvents = false, service = null } = options;
  return rows.filter((row) => {
    if (service && row.service !== service) return false;
    if (onlyWithKeyEvents && keyEventCount(row, keyEventName) <= 0) return false;
    return true;
  });
}

/** ページ表の合計（表のキャプションに出す） */
export function sumPageRows(
  rows: readonly AiTrafficPageRow[],
  keyEventName?: string | null,
): { sessions: number; users: number; keyEvents: number } {
  return rows.reduce(
    (acc, row) => ({
      sessions: acc.sessions + row.sessions,
      users: acc.users + row.users,
      keyEvents: acc.keyEvents + keyEventCount(row, keyEventName),
    }),
    { sessions: 0, users: 0, keyEvents: 0 },
  );
}
