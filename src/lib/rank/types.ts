/**
 * 順位計測（B1 / B2）と AI Overviews 引用（B3）の共通型。
 *
 * サーバー（/api/rank/measure）とクライアント（ストア・画面）の両方から参照するので、
 * ここには型と定数だけを置き、ネットワークや localStorage には触れない。
 */
import type { SerpDevice, SerpFeature } from "@/lib/serp/types";

export type { SerpDevice, SerpFeature };

/** 順位に載る上限。SerpApi へは num=100 で問い合わせるので、これを超えたら圏外扱い */
export const MAX_RANK = 100;

/** AI Overviews の引用元 1 件 */
export interface AioReference {
  url: string;
  title: string;
  /** www. を除いたホスト名（画面のバッジ判定に使う） */
  domain: string;
}

/** スナップショットに保存する AI Overviews の状態 */
export interface AioSnapshot {
  present: boolean;
  selfCited: boolean;
  competitorCited: boolean;
  references: AioReference[];
  /**
   * AIO は表示されていたが本文・引用元を取得できなかった（未取得）。
   * true の観測は 5 区分に分類せず、集計の分母から外す（実装ガイド §5.1）。
   */
  unavailable?: boolean;
  /** 引用されていた競合ドメイン（登録した表記のまま） */
  citedCompetitors?: string[];
  /** AIO 本文（A5 のトピック抽出に使う。日次では省略可） */
  text?: string;
}

/** 競合 1 社の順位 */
export interface CompetitorRank {
  domain: string;
  rank: number | null;
  url: string | null;
  title: string | null;
}

/** 1 キーワード × 1 回の計測結果（成功） */
export interface RankMeasurement {
  keyword: string;
  device: SerpDevice;
  location?: string;
  /** 自社の順位。圏外は null */
  rank: number | null;
  /** 自社のランディングページ */
  url: string | null;
  title: string | null;
  competitors: CompetitorRank[];
  aiOverview: AioSnapshot;
  features: SerpFeature[];
  totalResults: number | null;
  fetchedAt: string;
}

/** 1 キーワード × 1 回の計測結果（失敗）。バッチ全体は落とさず、行ごとに理由を返す */
export interface RankMeasureFailure {
  keyword: string;
  device: SerpDevice;
  location?: string;
  error: string;
}

export type RankMeasureItem = ({ ok: true } & RankMeasurement) | ({ ok: false } & RankMeasureFailure);

/** POST /api/rank/measure のリクエスト */
export interface RankMeasureRequest {
  keywords: Array<{ keyword: string; device?: SerpDevice; location?: string }>;
  projectDomain: string;
  competitorDomains?: string[];
  /** AIO 本文も返す（リアルタイム計測・A5 用）。既定 false */
  includeAioText?: boolean;
}

/** POST /api/rank/measure のレスポンス */
export interface RankMeasureResponse {
  results: RankMeasureItem[];
  measuredAt: string;
  provider: string;
}
