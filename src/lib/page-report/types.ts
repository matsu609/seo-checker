/**
 * ページ最適化レポート（A2 / A3）の型。
 *
 * 画面の 4 列表（評価項目 / ステータス / 内容 / 備考）をそのまま表す形にしてある。
 */
import type { PsiResult } from "@/lib/psi/types";
import type { SectionId } from "./config";
import type { RobotsMatrix } from "./robots";

/** 4 列表のステータス。User Insight の画面と同じ 3 段階 */
export type RowStatus = "適切" | "良好" | "要改善";

export interface ReportRow {
  /** 評価項目 */
  item: string;
  status: RowStatus;
  /** 内容（測定値・評価・理由） */
  content: string;
  /** 備考（詳細・改善提案） */
  note: string;
}

export interface ReportSection {
  id: SectionId;
  label: string;
  description: string;
  /** 配点 */
  weight: number;
  /** 0〜1 */
  ratio: number;
  /** 獲得点（weight × ratio） */
  points: number;
  rows: ReportRow[];
}

/** 検出した JSON-LD の 1 ノード */
export interface JsonLdNode {
  type: string;
  /** 直下に存在したプロパティ名 */
  properties: string[];
  /** 不足している必須プロパティ（定義があるタイプのみ） */
  missing: string[];
}

export interface HeadingNode {
  level: number;
  text: string;
}

/** ページから測った素の値（表の根拠として画面にも出す） */
export interface PageMeasurements {
  title: string | null;
  titleChars: number;
  description: string | null;
  descriptionChars: number;
  canonical: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  lang: string | null;
  hreflang: string[];
  publishedAt: string | null;
  modifiedAt: string | null;

  /** 本文の文字数（空白・記号を除く） */
  mainTextChars: number;
  /** ページ全体のテキスト文字数 */
  rawTextChars: number;
  /** 1 - 本文 / 全体。低いほど本文の密度が高い */
  noiseRatio: number;
  /** 平均文長（句点で区切った 1 文あたりの文字数） */
  averageSentenceChars: number;
  sentences: number;
  readable: boolean;

  headings: HeadingNode[];
  h1Count: number;
  headingSkips: number;
  subHeadings: number;
  /** 見出し 1 つあたりの本文文字数 */
  charsPerHeading: number;
  /** title と h1 の語の重なり（0〜1） */
  topicOverlap: number;

  jsonLd: { blocks: number; parseErrors: number; nodes: JsonLdNode[]; types: string[] };

  semantic: Record<string, number>;
  divCount: number;
  elementCount: number;

  internalLinks: number;
  externalLinks: number;
  /** 本文（main / article）の中にあるリンク */
  bodyLinks: number;
  /** 「こちら」「詳しくは」など内容の分からないアンカー */
  vagueAnchors: number;

  images: number;
  imagesWithAlt: number;
  /** alt が 6 文字以上ある画像（説明的な alt） */
  imagesWithDescriptiveAlt: number;
  altCoverage: number;

  metaRobots: string;
  xRobotsTag: string;
  noindex: boolean;
}

export interface PageReport {
  url: string;
  finalUrl: string;
  status: number;
  fetchedAt: string;
  /** 0〜100 */
  score: number;
  scoreLabel: string;
  sections: ReportSection[];
  measurements: PageMeasurements;
  robots: RobotsMatrix;
  llmsTxt: { present: boolean; length: number; url: string };
  /** ルールから組み立てた総評（3〜4 行） */
  summary: string[];
  /** 優先対応（上位 3 件） */
  priorities: { title: string; why: string; section: SectionId }[];
  /** A3。取得できなければ null */
  psi: PsiResult | null;
  /** PSI を取得できなかった理由（日本語） */
  psiError: string | null;
  notes: string[];
}
