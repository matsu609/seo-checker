/**
 * 事実シート（SeoFactSheet）の型。精密診断の中核。
 *
 * 収集した数字を URL 単位・領域単位に整理し、さらに 1 行ずつ ID を振った
 * `facts` に平坦化する。AI はこの facts だけを読み、主張ごとに ID を引用する
 * （docs/dev/seo-analysis-spec.md §0.2）。純粋なデータなので、ブラウザでも
 * サーバーでも同じ型を使う。
 */
import type { AuditCrawlStats, AuditCategory, Severity } from "@/lib/audit/types";
import type { CruxFailure, CruxHistory, CruxRecord } from "@/lib/crux/types";
import type { DomainPowerResult } from "@/lib/domain-power/types";
import type { ValidationCheck } from "@/lib/llms-txt/types";
import type { PsiResult } from "@/lib/psi/types";
import type { SerpFeature } from "@/lib/serp/types";
import type { SiteStructure, TrustSignals } from "../types";

export const SHEET_VERSION = 1;

/** 利用者の入力（URL 以外は任意） */
export interface AnalysisInput {
  url: string;
  /** 対策キーワード（最大 5） */
  keywords: string[];
  /** 業種（自由記述） */
  industry: string;
  /** サイトの目的 */
  goal: AnalysisGoal;
  /** 地域（例: 東京都世田谷区） */
  region: string;
  /** 競合サイトの URL（最大 2） */
  competitors: string[];
  /** ブランド名（空ならトップページの title から推定） */
  brand: string;
  /** クロールの上限ページ数 */
  maxPages: number;
  /** 誰が始めたか。auto = 月 1 回の自動再診断（r127）。無ければ手動 */
  source?: "manual" | "auto";
}

export type AnalysisGoal = "inquiry" | "ec" | "recruit" | "visit" | "media" | "other";

export const GOAL_LABELS: Record<AnalysisGoal, string> = {
  inquiry: "問い合わせ・資料請求",
  ec: "商品の販売（EC）",
  recruit: "採用",
  visit: "来店・予約",
  media: "閲覧・広告収入（メディア）",
  other: "その他",
};

export type FactArea = "input" | "crawl" | "structure" | "trust" | "speed" | "search" | "domain" | "llms" | "google";

export const FACT_AREA_LABELS: Record<FactArea, string> = {
  input: "入力",
  crawl: "テクニカル（クロール）",
  structure: "サイトの構成",
  trust: "信頼",
  speed: "速度（実ユーザー・診断）",
  search: "検索での見え方",
  domain: "外部からの評価",
  llms: "llms.txt（AI 向けの案内ファイル）",
  google: "Google 連携（使わない。案内のみ）",
};

/** AI が引用する 1 行の事実 */
export interface Fact {
  /** 例: "S-03" */
  id: string;
  area: FactArea;
  label: string;
  /** 表示用の値（数値は単位つきの文字列） */
  value: string;
  /** 補足（判定の根拠や実例） */
  note?: string;
  url?: string;
}

export interface SheetSite {
  origin: string;
  startUrl: string;
  crawledAt: string;
  crawl: AuditCrawlStats;
  bySeverity: Record<Severity, number>;
  byCategory: { category: AuditCategory; count: number }[];
  /** 件数の多いルール（上位。実例の URL を最大 3 件） */
  topRules: { ruleId: string; category: AuditCategory; severity: Severity; count: number; examples: string[] }[];
  /** ページごとの一覧は落とす（top / weak / cannibal だけ残す） */
  structure: Omit<SiteStructure, "pages">;
  trust: TrustSignals;
  /** クイック診断（AIO の採点）をトップページに掛けた結果 */
  quick: { score: number; categories: { id: string; label: string; score: number }[] } | null;
}

export interface SheetPsiEntry {
  url: string;
  /** "トップ" や重要度上位の順位 */
  label: string;
  result: PsiResult | null;
  error: string | null;
}

export interface SheetCruxUrl {
  url: string;
  record: CruxRecord | null;
  failure: CruxFailure | null;
}

export interface SheetSpeed {
  psi: SheetPsiEntry[];
  crux: {
    origin: CruxRecord | null;
    originFailure: CruxFailure | null;
    history: CruxHistory | null;
    urls: SheetCruxUrl[];
  };
  notes: string[];
}

export interface SheetKeywordResult {
  keyword: string;
  /** 自社の順位（100 位以内に無ければ null） */
  rank: number | null;
  url: string | null;
  /** 上位 3 件のドメイン */
  topDomains: string[];
  features: SerpFeature[];
  aiOverview: boolean;
  /** AI Overviews に自社が引用されているか（AIO が無ければ null） */
  ownCited: boolean | null;
  /** 競合（入力）の順位 */
  competitors: { host: string; rank: number | null }[];
}

export interface SheetSearch {
  keywords: SheetKeywordResult[];
  /** site: 検索の概算件数（インデックス数の目安） */
  siteCount: number | null;
  brand: { query: string; rank: number | null; url: string | null } | null;
  notes: string[];
}

/** ドメインパワーの採点結果（src/lib/domain-power/ が作る） */
export type SheetDomain = DomainPowerResult;

/**
 * llms.txt（AI 向けの案内ファイル）の評価。
 * 判定は生成ツール（/tools/llms-txt）と同じ `validateLlmsTxt` を使う。
 * 本文（raw）とリンクの一覧は保存が重くなるので落とし、件数だけ持つ。
 */
export interface SheetLlmsTxt {
  url: string;
  /** ファイルがあるか。これが「有無の評価」そのもの */
  present: boolean;
  status: number;
  /** 文字数 */
  length: number;
  bytes: number;
  title: string | null;
  summary: string | null;
  /** ## セクション名（最大 10） */
  sections: string[];
  linkCount: number;
  /** 説明が付いているリンクの数 */
  describedLinks: number;
  checks: ValidationCheck[];
  /** llms-full.txt（本文をまとめた大きい方） */
  full: { present: boolean; length: number };
}

export interface SheetGoogle {
  searchConsole: {
    siteUrl: string;
    range: { startDate: string; endDate: string };
    totals: { clicks: number; impressions: number; ctr: number; position: number };
    previousTotals: { clicks: number; impressions: number; ctr: number; position: number };
    queries: { query: string; clicks: number; impressions: number; ctr: number; position: number }[];
    pages: { page: string; clicks: number; impressions: number; ctr: number; position: number }[];
  } | null;
  ga4: {
    propertyId: string;
    range: { startDate: string; endDate: string };
    organic: { sessions: number; users: number; engagementRate: number; keyEvents: number };
    all: { sessions: number; keyEvents: number };
    landing: { page: string; sessions: number; keyEvents: number }[];
  } | null;
  notes: string[];
}

export interface SeoFactSheet {
  version: number;
  generatedAt: string;
  input: AnalysisInput;
  site: SheetSite;
  speed: SheetSpeed;
  search: SheetSearch;
  /** 外部からの評価（被リンクとインデックス数）。古い保存分には無い / 旧形式（総合点つき）のことがある */
  domain?: SheetDomain | null;
  /** llms.txt の有無と中身の評価。古い保存分には無い */
  llms?: SheetLlmsTxt | null;
  google: SheetGoogle;
  /**
   * どの取得が動いたか（キー未設定などで飛ばしたものは false）。
   * 古い保存分には searchConsole / ga4 / diagnosis のキーもあるが、2026-09-17 以降は読まない
   */
  coverage: { psi: boolean; crux: boolean; serp: boolean; domainPower?: boolean };
  facts: Fact[];
}
