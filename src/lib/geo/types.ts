/**
 * AI 検索モニタリング（GEO）の型。docs/dev/geo-monitoring-spec.md の §8 データモデル。
 *
 * ChatGPT / Gemini / Claude / Perplexity / Google AI Overviews / Google AI モードで、
 * 自社ブランドがどれだけ「引用（citation）」「参照（mention）」されているかを
 * 定期計測し、競合と比べる。
 *
 * 純粋な型だけを置く（ブラウザでもサーバーでも読む）。
 */

/**
 * 計測対象のモデル（利用者の指示 2026-09-21 で Claude / Perplexity / AI モードを追加）。
 *
 * 前の 3 つ（chatgpt / gemini / aio）は先頭に置いたまま増やす。保存済みの
 * 観測はモデル名を文字列で持っているので、並びを変えても読み替えは要らない。
 */
export const GEO_MODELS = ["chatgpt", "gemini", "claude", "perplexity", "aio", "ai_mode"] as const;
export type GeoModel = (typeof GEO_MODELS)[number];

export const GEO_MODEL_LABELS: Record<GeoModel, string> = {
  chatgpt: "ChatGPT",
  gemini: "Gemini",
  claude: "Claude",
  perplexity: "Perplexity",
  aio: "AI Overviews",
  ai_mode: "AI モード（Google）",
};

/**
 * プロンプトを投げて答えてもらうモデル（LLM）。
 * `aio` と `ai_mode` は Google の検索結果側から取るので、ここには入らない。
 */
export const GEO_LLM_MODELS = ["chatgpt", "gemini", "claude", "perplexity"] as const;
export type GeoLlmModel = (typeof GEO_LLM_MODELS)[number];

export function isLlmModel(model: GeoModel): model is GeoLlmModel {
  return (GEO_LLM_MODELS as readonly string[]).includes(model);
}

/**
 * 検索キーワード側で取るモデル（Google の検索結果から抜く）。
 * `trackAio` が立っているキーワードは **両方**を週 1 回ずつ測る
 * （利用者の決定 2026-09-21「週 1 回でいい」「AI モードも追加したい」）。
 */
export const GEO_SERP_MODELS = ["aio", "ai_mode"] as const;

/**
 * **Perplexity は DataForSEO に標準キュー（task_post）が無く Live だけ**。
 * そのため定期バッチでも Live を呼ぶ（仕様書 §7.4 の例外。判断の経緯に記録）。
 * 原価と消費クレジットも Live 相当で数える。
 */
export function isLiveOnlyModel(model: GeoModel): boolean {
  return model === "perplexity";
}

/**
 * 業界の地図（LLM Mentions。#127）が対応するプラットフォーム。
 * LLM Responses の 4 モデルとは別の軸で、いまは 2 つだけ。
 */
export const MENTION_PLATFORMS = ["google", "chat_gpt"] as const;
export type MentionPlatform = (typeof MENTION_PLATFORMS)[number];

export const MENTION_PLATFORM_LABELS: Record<MentionPlatform, string> = {
  google: "Google の AI 検索（AI Overviews）",
  chat_gpt: "ChatGPT",
};

/** 実行モード。定期バッチは必ず standard（§1.2 / §7.4） */
export type RunMode = "standard" | "live";

/** 計測の種類。`ai_mode` は AI Overviews とは別のエンドポイント */
export type MeasurementKind = "llm" | "rank" | "aio" | "ai_mode";

/** ブランドの区分 */
export type BrandType = "own" | "competitor";

/** 引用されたドメインの分類（§4.3） */
export type DomainClass = "own" | "competitor" | "third_party";

/** 第三者ドメインの内訳（§4.3。軽量 LLM で判定、失敗は other） */
export type ThirdPartyKind = "comparison" | "review" | "news" | "other";

export const DOMAIN_CLASS_LABELS: Record<DomainClass, string> = {
  own: "自社",
  competitor: "競合",
  third_party: "第三者",
};

export const THIRD_PARTY_LABELS: Record<ThirdPartyKind, string> = {
  comparison: "比較サイト",
  review: "口コミ",
  news: "ニュース",
  other: "その他",
};

/* ───────────── アカウント ───────────── */

/**
 * 契約単位。この製品では Clerk の user_id をそのままアカウント ID にする。
 * `runDayOffset` は実行日の顧客間分散（§2.4）。0〜6。
 */
export interface GeoAccount {
  userId: string;
  creditBalance: number;
  creditResetAt: string;
  runDayOffset: number;
  /** 高精度プロンプトの上限本数（§6.4） */
  precisionSlots: number;
  createdAt: string;
}

/* ───────────── ブランド ───────────── */

export interface GeoBrand {
  id: string;
  type: BrandType;
  displayName: string;
  /** 正式名称・カナ・英字・略称・サービス名（§4.1） */
  aliases: string[];
  /** サブドメインを含む自社／競合ドメイン */
  domains: string[];
  aliasesUpdatedAt: string | null;
  createdAt: string;
}

/* ───────────── 計測対象 ───────────── */

export interface GeoKeyword {
  id: string;
  text: string;
  normalizedHash: string;
  trackRank: boolean;
  trackAio: boolean;
  createdAt: string;
}

export interface GeoPrompt {
  id: string;
  text: string;
  normalizedHash: string;
  /** ブランド名を含む指名プロンプト（§2.2） */
  isBranded: boolean;
  /** 高精度枠（n=10/週）。指名プロンプトには付けさせない */
  precisionMode: boolean;
  models: GeoModel[];
  tags: string[];
  precisionModeChangedAt: string | null;
  createdAt: string;
}

/* ───────────── 計測（顧客間で共有） ───────────── */

/** 回答から抜いた引用リンク 1 件 */
export interface GeoCitation {
  /** 解決後の URL（Gemini のリダイレクトは解決してから入れる。§1.3） */
  url: string;
  /** 解決に失敗したら元の URL とともに true */
  unresolved: boolean;
  domain: string;
  title: string | null;
}

/**
 * 自然検索の 1 行（順位計測のときだけ計測に残す。2026-09-23）。
 * 同じドメインはいちばん上の 1 件だけ残す（順位はそこで決まるため）。
 */
export interface OrganicHit {
  domain: string;
  /** DataForSEO の rank_absolute（1 始まり） */
  rank: number;
}

/**
 * 1 回の計測。**アカウントをまたいで共有する**（§7.1）。
 * 同じ正規化ハッシュ × モデル × ロケールなら 24 時間は使い回す。
 */
export interface GeoMeasurement {
  id: string;
  kind: MeasurementKind;
  normalizedHash: string;
  /** 計測に使った原文（プロンプト or キーワード） */
  text: string;
  model: GeoModel;
  locale: string;
  executedAt: string;
  /** 取得できた範囲のモデルバージョン（§5.3） */
  modelVersion: string | null;
  /** 回答本文。順位計測のときは空 */
  responseText: string;
  citations: GeoCitation[];
  /**
   * 順位計測のときだけ入る。**共有の計測なので誰のドメインでもなく、いまは常に null**。
   * 利用者ごとの順位は `organic` から集計のときに引く（organic.ts の rankForDomains）
   */
  rank: number | null;
  /**
   * 自然検索の上位（順位計測のときだけ。2026-09-23 から保存）。
   * null / 未定義 = 保存していない（それより前の計測と、順位計測以外）
   */
  organic?: OrganicHit[] | null;
  mode: RunMode;
  costUsd: number;
}

/* ───────────── 観測（アカウントごと） ───────────── */

/** 1 計測 × 1 ブランドの判定結果（§3.1） */
export interface GeoObservation {
  id: string;
  measurementId: string;
  promptId: string | null;
  keywordId: string | null;
  brandId: string;
  cited: boolean;
  mentioned: boolean;
  /** 参照判定の確信度 0〜1（§4.2）。低いものは「要確認」 */
  mentionConfidence: number;
  /** 本文中の出現順位（1 始まり）。出てこなければ null */
  position: number | null;
  citedDomains: string[];
  domainClass: DomainClass | null;
  observedAt: string;
}

/* ───────────── 集計 ───────────── */

export type AggregateWindow = "week" | "rolling4w";

export interface GeoAggregate {
  brandId: string;
  /** "all" か タグ名（§3.4） */
  promptGroup: string;
  model: GeoModel | "all";
  window: AggregateWindow;
  /** 週の始まり（ISO の日付） */
  periodStart: string;
  shareMention: number;
  shareCitation: number;
  /** 参照率の Wilson 95% 信頼区間 */
  ciLow: number;
  ciHigh: number;
  n: number;
}

/** モデル更新の検知（§5.3）。グラフに縦線を引く */
export interface GeoModelVersionEvent {
  model: GeoModel;
  versionFrom: string | null;
  versionTo: string;
  detectedAt: string;
}

/* ───────────── クレジット ───────────── */

export type CreditAction =
  | "rank"
  | "aio"
  | "ai_mode"
  | "llm_mentions"
  | "llm_standard"
  | "llm_live"
  | "weekly_report"
  | "monthly_analysis";

export const CREDIT_ACTION_LABELS: Record<CreditAction, string> = {
  rank: "順位計測",
  aio: "AI Overviews 取得",
  ai_mode: "AI モード取得",
  llm_mentions: "業界の地図（LLM Mentions）",
  llm_standard: "LLM 計測（標準）",
  llm_live: "LLM 計測（今すぐ実行）",
  weekly_report: "週次レポート生成",
  monthly_analysis: "月次の深掘り分析",
};

export interface CreditLedgerEntry {
  id: string;
  action: CreditAction;
  credits: number;
  measurementId: string | null;
  /** キャッシュを使い回した計測か（§11 の決定の根拠を残す） */
  cacheHit: boolean;
  createdAt: string;
}
