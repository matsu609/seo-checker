/**
 * サイトレポート（E8）のブラウザ側ストア（localStorage + zod）。
 *
 * サーバーは状態を持たないので、期間・比較単位・指標・圏外の扱い・表の表示設定は
 * ここに置く。登録キーワードと順位スナップショットは順位計測（B1）の
 * src/lib/rank/store.ts が持っているものをそのまま読む（二重に持たない）。
 */
import { z } from "zod";
import { createStore } from "@/lib/store";
import { DEFAULT_OUT_OF_RANGE_RANK } from "./series";

const GranularitySchema = z.enum(["day", "week", "month"]);
const MetricSchema = z.enum(["sessions", "users"]);
/** table.ts の TrendFilter と同じ並び。zod は型から作れないので二重に書く */
const TrendFilterSchema = z.enum(["all", "up", "flat", "down", "out"]);

export const SiteReportSettingsSchema = z.object({
  /** 直近 N 日（GA4 は当日が未確定なので終端は昨日） */
  days: z.number().int().min(1).max(365),
  granularity: GranularitySchema,
  metric: MetricSchema,
  /** 圏外を何位として平均するか。null なら平均から除外 */
  outOfRangeRank: z.number().int().min(1).max(1000).nullable(),
  /** 競合の順位を表示 */
  showCompetitors: z.boolean(),
  /** トレンドアイコンによる絞り込み */
  trendFilter: TrendFilterSchema,
});

export type SiteReportSettings = z.infer<typeof SiteReportSettingsSchema>;

export const DEFAULT_SITE_REPORT_SETTINGS: SiteReportSettings = {
  days: 28,
  granularity: "day",
  metric: "sessions",
  outOfRangeRank: DEFAULT_OUT_OF_RANGE_RANK,
  showCompetitors: false,
  trendFilter: "all",
};

export const siteReportSettingsStore = createStore<SiteReportSettings>(
  "siteReportSettings",
  SiteReportSettingsSchema,
  DEFAULT_SITE_REPORT_SETTINGS,
);
