/**
 * 外部連携の定義（クライアントでも読める。キーの値は一切含まない）。
 * 実際に設定されているかどうかは src/lib/integrations.ts（サーバー）が判定し、
 * GET /api/integrations で boolean だけを返す。
 */
export const INTEGRATION_KEYS = [
  "anthropic",
  "openai",
  "gemini",
  "perplexity",
  "serpapi",
  "pagespeed",
  "ga4",
  "places",
] as const;

export type IntegrationKey = (typeof INTEGRATION_KEYS)[number];

export interface IntegrationMeta {
  key: IntegrationKey;
  label: string;
  /** .env.local に設定する変数名（複数のときは全部必要） */
  envVars: readonly string[];
  /** 何に使うか（設定画面・SetupNotice に出す） */
  description: string;
}

export const INTEGRATIONS: Record<IntegrationKey, IntegrationMeta> = {
  anthropic: {
    key: "anthropic",
    label: "Anthropic（Claude）",
    envVars: ["ANTHROPIC_API_KEY"],
    description: "FAQ 生成・LLM サマリー・LLMO（Claude）・プロンプト拡張・AI ライティング",
  },
  openai: {
    key: "openai",
    label: "OpenAI（ChatGPT）",
    envVars: ["OPENAI_API_KEY"],
    description: "LLMO モニタリングで ChatGPT を対象にする",
  },
  gemini: {
    key: "gemini",
    label: "Google Gemini",
    envVars: ["GEMINI_API_KEY"],
    description: "LLMO モニタリングで Gemini を対象にする",
  },
  perplexity: {
    key: "perplexity",
    label: "Perplexity",
    envVars: ["PERPLEXITY_API_KEY"],
    description: "LLMO モニタリングで Perplexity を対象にする",
  },
  serpapi: {
    key: "serpapi",
    label: "SerpApi（Google 検索結果）",
    envVars: ["SERPAPI_KEY"],
    description: "順位計測・AI Overviews の引用チェック・ページ診断の上位 10 件取得",
  },
  pagespeed: {
    key: "pagespeed",
    label: "PageSpeed Insights",
    envVars: ["PAGESPEED_API_KEY"],
    description: "表示速度・Core Web Vitals の取得（未設定でも低頻度なら動作）",
  },
  ga4: {
    key: "ga4",
    label: "Google Analytics 4",
    envVars: ["GA4_PROPERTY_ID", "GOOGLE_SERVICE_ACCOUNT_JSON"],
    description: "生成 AI 流入分析・サイトレポート（GA4 Data API）",
  },
  places: {
    key: "places",
    label: "Google マップ（Places API）",
    envVars: ["GOOGLE_PLACES_API_KEY"],
    description: "Google マップ・店舗情報（MEO）。自社と競合のビジネス プロフィールの比較と充実度の採点",
  },
};

/** 連携ごとの設定有無。GET /api/integrations のレスポンス */
export type IntegrationStatus = Record<IntegrationKey, boolean>;

export function integrationMeta(key: IntegrationKey): IntegrationMeta {
  return INTEGRATIONS[key];
}
