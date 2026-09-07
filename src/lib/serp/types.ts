/**
 * SERP（検索結果）取得の共通型。プロバイダ（SerpApi など）が違っても同じ形に正規化する。
 * `raw` には取得した JSON をそのまま入れ、後から再集計できるようにする（保存は呼び出し側）。
 */

export type SerpDevice = "desktop" | "mobile";

export interface SerpQuery {
  q: string;
  device?: SerpDevice;
  /** 取得件数（既定 100） */
  num?: number;
  /** 国（既定 jp） */
  gl?: string;
  /** 言語（既定 ja） */
  hl?: string;
  /** 例: "Tokyo, Japan" */
  location?: string;
}

export interface SerpOrganicResult {
  /** 1 始まり */
  position: number;
  title: string;
  url: string;
  displayedUrl?: string;
  snippet?: string;
  date?: string;
  sitelinks?: Array<{ title: string; url: string }>;
}

/** SERP フィーチャーの種類（表示に使うラベルは SERP_FEATURE_LABELS） */
export type SerpFeature =
  | "ai_overview"
  | "answer_box"
  | "knowledge_graph"
  | "people_also_ask"
  | "related_searches"
  | "local_pack"
  | "shopping"
  | "top_stories"
  | "videos"
  | "images"
  | "discussions"
  | "sitelinks"
  | "twitter"
  | "recipes"
  | "jobs"
  | "events"
  | "ads";

export const SERP_FEATURE_LABELS: Record<SerpFeature, string> = {
  ai_overview: "AI Overviews（AI による概要）",
  answer_box: "強調スニペット",
  knowledge_graph: "ナレッジパネル",
  people_also_ask: "他の人はこちらも質問",
  related_searches: "関連する検索",
  local_pack: "ローカル（地図）",
  shopping: "ショッピング",
  top_stories: "トップニュース",
  videos: "動画",
  images: "画像",
  discussions: "ディスカッションとフォーラム",
  sitelinks: "サイトリンク",
  twitter: "X（Twitter）",
  recipes: "レシピ",
  jobs: "求人",
  events: "イベント",
  ads: "広告",
};

export interface SerpAiOverviewReference {
  url: string;
  title: string;
  snippet?: string;
  /** サイト名（例: "example.com"） */
  source?: string;
  /** references 配列内の index（text_blocks の reference_indexes と対応） */
  index?: number;
}

export interface SerpAiOverview {
  /** text_blocks を読みやすい本文に平坦化したもの */
  text: string;
  references: SerpAiOverviewReference[];
}

export interface SerpRelatedQuestion {
  question: string;
  snippet?: string;
  title?: string;
  url?: string;
}

export interface SerpResult {
  query: string;
  device: SerpDevice;
  organic: SerpOrganicResult[];
  features: SerpFeature[];
  /** AI Overviews が無いときは null（取得できなかったときも null） */
  aiOverview: SerpAiOverview | null;
  /**
   * AI Overviews は表示されていたが、本文・引用元を取得できなかった。
   * （SerpApi は本文を別リクエスト（page_token）で返すため、そこが
   * レート制限・タイムアウトで落ちると aiOverview は null になる。
   * 「表示なし」と区別できないと、未取得の日が「AIO なし」として集計されてしまう）
   */
  aiOverviewUnavailable?: boolean;
  relatedQuestions: SerpRelatedQuestion[];
  relatedSearches: string[];
  totalResults: number | null;
  fetchedAt: string;
  provider: string;
  /** 取得した JSON そのまま */
  raw: unknown;
}

export interface SerpProvider {
  readonly name: string;
  search(query: SerpQuery): Promise<SerpResult>;
}
