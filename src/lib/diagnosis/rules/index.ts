/**
 * 診断ルールの一覧（docs/dev/diagnosis-rules-spec.md §9）。
 *
 * ここは宣言を並べるだけ。発火判定は engine.ts。
 * 段階 G3（2026-09-15）で実装したのは、データ品質と Search Console のルール。
 * GA4（A / L / E / K / M）・GSC × GA4（X）・CRM（B）は G4 以降。
 */
import type { DiagnosisRule } from "../types";
import { QUALITY_RULES, QUALITY_PENDING } from "./quality";
import { TIMESERIES_RULES, TIMESERIES_PENDING } from "./timeseries";
import { QUERY_RULES } from "./query";
import { PAGE_RULES, PAGE_PENDING } from "./page";
import { SEGMENT_RULES, SEGMENT_PENDING } from "./segment";
import { URL_RULES, APPEARANCE_RULES } from "./url";

export const ALL_RULES: DiagnosisRule[] = [
  ...QUALITY_RULES,
  ...TIMESERIES_RULES,
  ...QUERY_RULES,
  ...PAGE_RULES,
  ...SEGMENT_RULES,
  ...URL_RULES,
  ...APPEARANCE_RULES,
];

/** 追加データが揃えば判定できるルール。画面で「判定していない項目」として出す */
export interface PendingRule {
  id: string;
  name: string;
  needs: string;
}

export const PENDING_RULES: PendingRule[] = [
  ...QUALITY_PENDING,
  ...TIMESERIES_PENDING,
  ...PAGE_PENDING,
  ...SEGMENT_PENDING,
  // GA4 の取り込み（段階 G4）で実装するルール群
  { id: "A01〜A10", name: "集客（チャネル・参照元）", needs: "GA4 のトラフィック獲得" },
  { id: "L01〜L10", name: "ランディングページ", needs: "GA4 のランディングページ" },
  { id: "E01〜E10", name: "エンゲージメント", needs: "GA4 のページ・スクリーン" },
  { id: "K01〜K12", name: "CTA・フォーム", needs: "GA4 のイベント（共通イベントへの対応表）" },
  { id: "M01〜M10", name: "計測の不具合", needs: "GA4 のイベント・参照元" },
  { id: "X01〜X20", name: "Search Console × GA4", needs: "両方の連携" },
  { id: "B01〜B10", name: "CRM・営業", needs: "問い合わせ・商談・受注の件数" },
];

export { QUALITY_RULES, TIMESERIES_RULES, QUERY_RULES, PAGE_RULES, SEGMENT_RULES, URL_RULES, APPEARANCE_RULES };
