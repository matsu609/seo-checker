/**
 * 自動診断の型（docs/dev/diagnosis-rules-spec.md §13〜§15）。
 *
 * 「計算はプログラム / 診断はルール / 説明は LLM / 承認は人間」の分担のうち、
 * ルールの宣言とその発火結果の形をここで決める。ルール本体は rules/ に、
 * 発火判定は engine.ts に置く（どちらも純関数）。
 */
import type { AnalysisGoal } from "@/lib/seo-analysis/sheet/types";
import type { Thresholds } from "./thresholds";
import type { QueryIntent } from "./normalize";

/** 重要度（§15）。サイト診断の 3 段（Severity）とは別の型にする */
export type RuleSeverity = "critical" | "high" | "medium" | "low";

export const RULE_SEVERITY_LABELS: Record<RuleSeverity, string> = {
  critical: "重大",
  high: "高",
  medium: "中",
  low: "低",
};

/** 確度（§15） */
export type Confidence = "high" | "medium" | "low";

export const CONFIDENCE_LABELS: Record<Confidence, string> = {
  high: "高（データから直接確認できる）",
  medium: "中（複数の数値が同じ可能性を示す）",
  low: "低（追加データがないと判断できない）",
};

/** 実装負担（§15） */
export type Effort = "small" | "medium" | "large";

export const EFFORT_LABELS: Record<Effort, string> = {
  small: "小",
  medium: "中",
  large: "大",
};

/** ルールの分類。ID の頭文字と対応する */
export type RuleCategory = "quality" | "timeseries" | "query" | "page" | "segment" | "url" | "appearance" | "traffic" | "landing" | "engagement" | "cta" | "measurement" | "cross" | "crm";

export const RULE_CATEGORY_LABELS: Record<RuleCategory, string> = {
  quality: "データ品質",
  timeseries: "検索の推移（GSC）",
  query: "検索クエリ（GSC）",
  page: "ページ（GSC）",
  segment: "デバイス・国（GSC）",
  url: "URL（GSC）",
  appearance: "検索での見え方（GSC）",
  traffic: "集客（GA4）",
  landing: "ランディングページ（GA4）",
  engagement: "エンゲージメント（GA4）",
  cta: "CTA・フォーム（GA4）",
  measurement: "計測（GA4）",
  cross: "GSC × GA4",
  crm: "CRM・営業",
};

/** ルールの宣言（§14）。1 ルール = 1 オブジェクト。コードは engine.ts だけ */
export interface DiagnosisRule {
  /** 例: "Q03" */
  id: string;
  category: RuleCategory;
  name: string;
  severity: RuleSeverity;
  /** 既定の確度。evaluate が返す confidence で上書きできる */
  defaultConfidence: Confidence;
  /** 数値から直接言えること（原因ではない） */
  fact: string;
  /** 原因の候補。断定しない */
  possibleCauses: string[];
  /** まだ確認が必要なこと */
  requiredChecks: string[];
  /** 推奨する打ち手 */
  recommendedActions: string[];
  /** 書いてはいけない結論（§18 のうち、このルールに効くもの） */
  prohibitedConclusions: string[];
  /** 実装負担の目安（優先度スコアに使う） */
  effort: Effort;
  /**
   * 発火判定。発火しなければ null。
   * 返す evidence は「数値の根拠」で、これがそのまま LLM と画面に渡る。
   */
  evaluate: (ctx: DiagnosisContext) => RuleOutcome | null;
}

export interface RuleOutcome {
  /** 判定の根拠になった数値（1 行 1 件） */
  evidence: string[];
  /** 既定の確度を上書きする場合 */
  confidence?: Confidence;
  /** 対象の URL やクエリ（画面で並べる） */
  subjects?: string[];
  /** 影響量（0〜1）。優先度スコアに掛ける。省略時は 0.5 */
  impact?: number;
}

/** 発火したルール（§13 の triggered_rules） */
export interface TriggeredRule {
  id: string;
  category: RuleCategory;
  name: string;
  severity: RuleSeverity;
  confidence: Confidence;
  evidence: string[];
  fact: string;
  possibleCauses: string[];
  requiredChecks: string[];
  recommendedActions: string[];
  prohibitedConclusions: string[];
  effort: Effort;
  subjects: string[];
  /** 優先度スコア（§15）。大きいほど先に手を付ける */
  priority: number;
}

/* ───────────── 入力データ（§4） ───────────── */

export interface DateRange {
  startDate: string;
  endDate: string;
}

/** GSC の 1 行分の指標 */
export interface SearchMetrics {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface KeyedMetrics extends SearchMetrics {
  key: string;
}

/** 当期と前期の組 */
export interface Paired<T> {
  current: T;
  previous: T;
}

export interface GscDataset {
  siteUrl: string;
  range: Paired<DateRange>;
  totals: Paired<SearchMetrics>;
  /** 日別（当期のみ。急増・急減の判定に使う） */
  byDate: KeyedMetrics[];
  queries: Paired<KeyedMetrics[]>;
  pages: Paired<KeyedMetrics[]>;
  devices: Paired<KeyedMetrics[]>;
  countries: Paired<KeyedMetrics[]>;
  /** 検索での見え方。取得できなければ null（S01 はこれを「エラー」と断定しない） */
  appearances: KeyedMetrics[] | null;
  /** 取得の過程で分かった制約（行数の上限に当たった、など） */
  notes: string[];
}

/** GA4 は G4 で埋める。いまは連携の有無だけ見る（D 系のルールが参照する） */
export interface Ga4Dataset {
  propertyId: string;
  range: DateRange;
  organic: { sessions: number; users: number; engagementRate: number; keyEvents: number };
  all: { sessions: number; keyEvents: number };
  landing: { page: string; sessions: number; keyEvents: number }[];
}

/** ルールが見る入力一式 */
export interface DiagnosisContext {
  thresholds: Thresholds;
  /** 分析対象のオリジン */
  origin: string;
  /** サイトの目的（業種プリセットの元） */
  goal: AnalysisGoal;
  /** 想定している市場（国コード。GSC の country は 3 文字） */
  targetCountries: string[];
  /** 指名検索の判定に使う語 */
  brandTerms: string[];
  gsc: GscDataset | null;
  ga4: Ga4Dataset | null;
  /** 派生値（engine が事前に計算して渡す。ルールの中で再計算しない） */
  derived: DerivedMetrics;
}

/** ルールが共通で使う派生値（§7 の計算結果） */
export interface DerivedMetrics {
  daysCurrent: number;
  daysPrevious: number;
  /** クエリ取得率（クエリ一覧のクリック合計 ÷ 全体クリック） */
  queryCoverage: number | null;
  /** 指名検索のクリック比率（クエリ一覧の中での比率） */
  brandClickShare: number | null;
  /** 非指名のクリック合計（当期 / 前期） */
  nonBrandClicks: Paired<number>;
  brandClicks: Paired<number>;
  /** クエリ一覧のクリック合計 */
  queryClicks: Paired<number>;
  /** 意図ごとのクリック合計（当期） */
  byIntent: { intent: QueryIntent; clicks: number; impressions: number; queries: number }[];
  /** トップページのクリック比率 */
  homepageClickShare: number | null;
  /** 対象外の国の表示比率 */
  foreignImpressionShare: number | null;
}

/** 診断の結果（§13 の JSON に相当） */
export interface DiagnosisResult {
  /** ルール一式の版（再現性。§20） */
  rulesVersion: number;
  thresholdsVersion: number;
  generatedAt: string;
  period: { current: DateRange | null; previous: DateRange | null; daysCurrent: number; daysPrevious: number };
  triggered: TriggeredRule[];
  /** 発火しなかったが、データがあれば判定できたもの（何が足りないか） */
  limitations: string[];
  /** 判定に使った母数（画面に出す） */
  summary: DiagnosisSummary | null;
}

export interface DiagnosisSummary {
  siteUrl: string;
  totals: Paired<SearchMetrics>;
  clicksChangeRate: number | null;
  impressionsChangeRate: number | null;
  ctrChangeRate: number | null;
  positionDiff: number;
  queryCoverage: number | null;
  brandClickShare: number | null;
}
