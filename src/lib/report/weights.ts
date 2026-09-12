/**
 * 診断項目の配点（analyzer の各 check() 呼び出しと同じ値の写し）。
 *
 * ページ単位の結果（CheckResult）は weight を持っているが、サイト単位の集計
 * （SiteCheckSummary）は持っていない。サイトモードで「未対応ページ数 × 配点」
 * の優先順位や見込み加点を出すためにここで参照する。
 * src/lib/report/__tests__/weights.test.ts が analyzer の実際の出力と一致することを検証する。
 */
import {
  CATEGORY_LABELS,
  CATEGORY_WEIGHTS,
  type CategoryId,
} from "@/lib/analyzer/types";

export const CHECK_WEIGHTS: Record<string, number> = {
  // AI クローラ可否
  "ai-crawlers-allowed": 3,
  "ai-crawlers-training": 0,
  noindex: 2,
  "llms-txt": 0,
  "llms-full-txt": 0,
  // 構造化データ
  "jsonld-exists": 3,
  "jsonld-parse-error": 2,
  "jsonld-organization": 2,
  "jsonld-website": 1,
  "jsonld-search-action": 0,
  "jsonld-breadcrumb": 1,
  "jsonld-faq": 2,
  "jsonld-sameas": 1,
  "jsonld-article": 0,
  "jsonld-product": 0,
  // メタ情報
  title: 3,
  description: 3,
  ogp: 2,
  canonical: 1,
  lang: 1,
  // 見出し
  h1: 3,
  "heading-structure": 2,
  // コンテンツ
  "js-rendering": 3,
  "content-specificity": 3,
  "content-length": 0,
  "content-heading-body": 1,
  "image-alt": 1,
};

/** 項目 ID → 配点。未知の ID は 1 とみなす */
export function checkWeight(id: string): number {
  const w = CHECK_WEIGHTS[id];
  return typeof w === "number" ? w : 1;
}

/** カテゴリの表示順（scoring.ts と同じ） */
export const CATEGORY_ORDER: readonly CategoryId[] = [
  "crawlers",
  "structuredData",
  "meta",
  "headings",
  "content",
];

export function categoryIndex(id: CategoryId): number {
  const i = CATEGORY_ORDER.indexOf(id);
  return i === -1 ? CATEGORY_ORDER.length : i;
}

/** 付録 B「診断方法と採点基準」に載せる、カテゴリごとの主な確認内容 */
export const CATEGORY_CRITERIA: Record<CategoryId, string> = {
  crawlers:
    "robots.txt での AI 検索用クローラ（OAI-SearchBot・PerplexityBot・Claude-SearchBot など）の許可、noindex の有無。サイト内検索の結果・買い物かご・ログイン後の画面など、もともと検索に載せないページは、noindex も robots.txt での拒否も減点しません（サイト全体が拒否されている場合は減点します）。学習用クローラ（GPTBot など）の拒否と llms.txt の有無は参考表示で、採点していません",
  structuredData:
    "JSON-LD の有無と文法、Organization / パンくず / sameAs（公式 SNS 等）。WebSite はトップページのみ、パンくずは階層のある下層ページのみ、FAQPage は画面に FAQ が実在するページのみを採点します",
  meta: "title・meta description の有無と長さ、OGP、canonical、html の lang 属性",
  headings: "h1 の数、h2 / h3 による見出し階層と階層飛び",
  content:
    "AI が引用できる具体的な情報（数値・日付・組織名・連絡先）の有無、見出しに本文が伴っているか、JavaScript 描画への依存、画像の alt 属性。本文の文字数は参考表示で、採点していません",
};

export { CATEGORY_LABELS, CATEGORY_WEIGHTS };
