/**
 * 診断ルールの一覧（docs/dev/diagnosis-rules-spec.md §9）。
 *
 * ここは宣言を並べるだけ。発火判定は engine.ts。
 * 段階 G3（2026-09-15）でデータ品質と Search Console、
 * 段階 G4（2026-09-16）で GA4（A / L / E / K / M）を実装した。
 * GSC × GA4（X）は G5、CRM（B）は G8。
 */
import type { DiagnosisRule } from "../types";
import { QUALITY_RULES, QUALITY_PENDING } from "./quality";
import { TIMESERIES_RULES, TIMESERIES_PENDING } from "./timeseries";
import { QUERY_RULES } from "./query";
import { PAGE_RULES, PAGE_PENDING } from "./page";
import { SEGMENT_RULES, SEGMENT_PENDING } from "./segment";
import { URL_RULES, APPEARANCE_RULES } from "./url";
import { TRAFFIC_RULES } from "./traffic";
import { LANDING_RULES, LANDING_PENDING } from "./landing";
import { ENGAGEMENT_RULES, ENGAGEMENT_PENDING } from "./engagement";
import { CTA_RULES, CTA_PENDING } from "./cta";
import { MEASUREMENT_RULES, MEASUREMENT_PENDING } from "./measurement";

export const ALL_RULES: DiagnosisRule[] = [
  ...QUALITY_RULES,
  ...TIMESERIES_RULES,
  ...QUERY_RULES,
  ...PAGE_RULES,
  ...SEGMENT_RULES,
  ...URL_RULES,
  ...APPEARANCE_RULES,
  ...TRAFFIC_RULES,
  ...LANDING_RULES,
  ...ENGAGEMENT_RULES,
  ...CTA_RULES,
  ...MEASUREMENT_RULES,
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
  ...LANDING_PENDING,
  ...ENGAGEMENT_PENDING,
  ...CTA_PENDING,
  ...MEASUREMENT_PENDING,
  { id: "X01〜X20", name: "Search Console × GA4 の突き合わせ", needs: "両方の連携（段階 G5 で実装）" },
  { id: "B01〜B10", name: "CRM・営業（商談化・受注への貢献）", needs: "問い合わせ・有効リード・商談・受注の件数（段階 G8）" },
];

export { QUALITY_RULES, TIMESERIES_RULES, QUERY_RULES, PAGE_RULES, SEGMENT_RULES, URL_RULES, APPEARANCE_RULES, TRAFFIC_RULES, LANDING_RULES, ENGAGEMENT_RULES, CTA_RULES, MEASUREMENT_RULES };
