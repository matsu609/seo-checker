/**
 * 生成 AI 流入分析（B6）のブラウザ側ストア（localStorage + zod）。
 *
 * サーバーは状態を持たないので、期間・比較単位・指標の選択と、
 * ユーザーが追加した参照元辞書（§19「自己拡張できる辞書」）はここに置く。
 * GA4 が未設定でも「辞書だけ先に整える」ことができるよう、計測とは独立して読み書きできる。
 */
import { z } from "zod";
import type { AiSourceEntry } from "@/lib/ga4/ai-sources";
// 期間の計算は GA4 と共通（純関数だけを持つ period.ts から直接読む。
// index 経由だとサーバー専用の auth.ts までクライアントに入ってしまう）
import { daysInRange, isIsoDate, rangeForDays, type DateRange } from "@/lib/ga4/period";
import { createStore } from "@/lib/store";

const GranularitySchema = z.enum(["day", "week", "month"]);
const MetricSchema = z.enum(["sessions", "users"]);

export const AiTrafficSettingsSchema = z.object({
  /** 直近 N 日（0 なら startDate / endDate を使う） */
  days: z.number().int().min(0).max(365),
  /** 任意指定の期間（days が 0 のときだけ使う） */
  startDate: z.string(),
  endDate: z.string(),
  granularity: GranularitySchema,
  metric: MetricSchema,
  /** 列に出すキーイベント名（GA4 の keyEvents:<name>） */
  keyEventNames: z.array(z.string()).max(5),
});

export type AiTrafficSettings = z.infer<typeof AiTrafficSettingsSchema>;

export const DEFAULT_AI_TRAFFIC_SETTINGS: AiTrafficSettings = {
  days: 28,
  startDate: "",
  endDate: "",
  granularity: "day",
  metric: "sessions",
  keyEventNames: [],
};

export const aiTrafficSettingsStore = createStore<AiTrafficSettings>(
  "aiTrafficSettings",
  AiTrafficSettingsSchema,
  DEFAULT_AI_TRAFFIC_SETTINGS,
);

export const AiSourceEntrySchema = z.object({
  host: z.string(),
  service: z.string(),
});

/**
 * 追加できる参照元の上限。
 * localStorage には容量の上限があり、際限なく増やせると保存そのものが
 * 失敗するようになるため、現実的な件数で頭打ちにする。
 */
export const MAX_AI_SOURCE_EXTRAS = 100;

export const aiSourceExtrasStore = createStore<AiSourceEntry[]>(
  "aiSourceExtras",
  z.array(AiSourceEntrySchema).max(MAX_AI_SOURCE_EXTRAS),
  [],
);

/** ホスト名の見た目を整える（保存前に 1 回だけ通す） */
export function cleanHost(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .split(/[/?#]/)[0]
    .replace(/:\d+$/, "")
    .replace(/^www\./, "")
    .replace(/\.+$/, "");
}

/** ホストとして最低限の形か（ドットを 1 つ以上含み、使える文字だけ） */
export function isValidHost(host: string): boolean {
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host);
}

/**
 * 追加辞書に 1 件足す。既にあるホストは上書きする。
 * 追加できなかった理由（日本語）を返す。成功なら null。
 */
export function addAiSource(host: string, service: string): string | null {
  const h = cleanHost(host);
  const s = service.trim();
  if (!h) return "参照元のホスト名を入力してください";
  if (!isValidHost(h)) return "ホスト名の形式が正しくありません（例: chatgpt.com）";
  if (!s) return "サービス名を入力してください";
  const current = aiSourceExtrasStore.get();
  const isNew = !current.some((e) => cleanHost(e.host) === h);
  if (isNew && current.length >= MAX_AI_SOURCE_EXTRAS) {
    return `追加できる参照元は ${MAX_AI_SOURCE_EXTRAS} 件までです。不要なものを削除してください`;
  }
  aiSourceExtrasStore.update((prev) => [...prev.filter((e) => cleanHost(e.host) !== h), { host: h, service: s }]);
  return null;
}

export function removeAiSource(host: string): void {
  const h = cleanHost(host);
  aiSourceExtrasStore.update((prev) => prev.filter((e) => cleanHost(e.host) !== h));
}

/* ───────────── 期間の解決 ───────────── */

/** カスタム期間の上限（GA4 の応答が大きくなりすぎないようにする） */
export const MAX_RANGE_DAYS = 366;

export interface ResolvedRange {
  /** GA4 に渡す期間。使えないときは null */
  range: DateRange | null;
  /** 期間として使えない理由（日本語）。使えるなら null */
  error: string | null;
}

/**
 * 設定 → 実際に GA4 へ渡す期間。
 * days > 0 はプリセット（昨日を終端にした直近 N 日）、0 のときは startDate / endDate を使う。
 * 画面はここで返る error をそのままフォームの下に出す（不正な期間で API を叩かないため）。
 */
export function resolveRange(settings: AiTrafficSettings, today = new Date()): ResolvedRange {
  if (settings.days > 0) return { range: rangeForDays(settings.days, today), error: null };
  const startDate = settings.startDate.trim();
  const endDate = settings.endDate.trim();
  if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
    return { range: null, error: "開始日と終了日を YYYY-MM-DD 形式で指定してください" };
  }
  const range: DateRange = { startDate, endDate };
  const days = daysInRange(range);
  if (days <= 0) return { range: null, error: "終了日には開始日と同じ日か、それより後の日付を指定してください" };
  if (days > MAX_RANGE_DAYS) return { range: null, error: `期間は最大 ${MAX_RANGE_DAYS} 日までです` };
  return { range, error: null };
}
