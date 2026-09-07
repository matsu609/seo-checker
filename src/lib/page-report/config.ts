/**
 * ページ最適化レポート（A2）の配点と閾値。
 *
 * 重みは docs/reference/04_implementation-guide.md §2.3 のとおり合計 100。
 * 運用しながら調整できるよう、数値はすべてこのファイルに集める。
 */

export const SECTION_IDS = [
  "content",
  "headings",
  "structuredData",
  "head",
  "semantic",
  "internalLinks",
  "robots",
  "images",
] as const;

export type SectionId = (typeof SECTION_IDS)[number];

/** セクションの重み（合計 100） */
export const SECTION_WEIGHTS: Record<SectionId, number> = {
  content: 20,
  headings: 15,
  structuredData: 15,
  head: 10,
  semantic: 10,
  internalLinks: 10,
  robots: 10,
  images: 10,
};

export const SECTION_LABELS: Record<SectionId, string> = {
  content: "本文抽出・評価",
  headings: "見出し構造",
  structuredData: "構造化データ",
  head: "Head 情報",
  semantic: "セマンティックタグ",
  internalLinks: "内部リンク構造",
  robots: "robots・llms",
  images: "画像 alt 属性",
};

/** セクションの説明（画面のタブ・表の見出しに添える） */
export const SECTION_DESCRIPTIONS: Record<SectionId, string> = {
  content: "AI が引用できる本文がどれだけ含まれているか。",
  headings: "話題の大小が見出しの階層として表現されているか。",
  structuredData: "ページの意味を機械が読める形（JSON-LD）で示せているか。",
  head: "ページを識別する情報（title・description・canonical・OGP）がそろっているか。",
  semantic: "本文がどこかを HTML の要素で示せているか。",
  internalLinks: "本文中から関連ページへ案内できているか。",
  robots: "AI クローラがこのページを読めるか。",
  images: "画像の内容が文字（alt）でも伝わるか。",
};

export const PAGE_REPORT_THRESHOLDS = {
  /** 本文の文字数（適切 / 良好の境界） */
  contentGood: 1500,
  contentFair: 500,
  /** ノイズ除去率（1 - 本文 / ページ全体）。低いほど本文の密度が高い */
  noiseGood: 0.3,
  noiseFair: 0.6,
  /** 本文内リンクの本数 */
  bodyLinksGood: 3,
  bodyLinksFair: 1,
  /** alt 充足率 */
  altGood: 0.9,
  altFair: 0.7,
  /** title の全角換算文字数 */
  titleMin: 10,
  titleMax: 40,
  /** description の全角換算文字数 */
  descMin: 50,
  descMax: 120,
  /** 平均文長（これを超えると読みにくい） */
  longSentenceChars: 60,
  /** 見出しの間隔（これ以上の文字数に 1 つは見出しが欲しい） */
  charsPerHeading: 800,
} as const;

/** ステータスと獲得率。適切 = 満点、良好 = 6 割、要改善 = 0 */
export const STATUS_RATIO = { 適切: 1, 良好: 0.6, 要改善: 0 } as const;

/** 総合スコアのバッジ（docs §2.3） */
export const SCORE_BANDS = [
  { min: 80, label: "良好" },
  { min: 60, label: "改善余地あり" },
  { min: 0, label: "要改善" },
] as const;

export function scoreBandLabel(score: number): string {
  return SCORE_BANDS.find((b) => score >= b.min)?.label ?? "要改善";
}

/** PageSpeed Insights の結果を保持する時間 */
export const PSI_CACHE_MS = 24 * 60 * 60 * 1000;
