/**
 * 検索パフォーマンス（推定）の型。
 *
 * Search Console を連携していないお客様に、契約初日から数字を出すための仕組み。
 * 「そのドメインが順位を持っているキーワード」を DataForSEO Labs から取り、
 * 順位別 CTR カーブ（src/lib/site-report/findability.ts）を掛けて表示回数と
 * クリック数を推定する。
 *
 * **実測ではない。**Search Console を連携していればそちらが常に正しい。
 * 画面では必ず「推定」と明示し、実測と混ぜない。
 */

/** DataForSEO から取れた 1 キーワード分（推定の入力） */
export interface RankedKeyword {
  keyword: string;
  /** 自然検索の順位。圏外・不明は null */
  rank: number | null;
  /** 月間検索数。不明は null（推定から除外する） */
  monthlyVolume: number | null;
  /** そのキーワードで順位が付いているページ */
  url: string | null;
}

/** 推定を足した 1 行 */
export interface EstimatedRow extends RankedKeyword {
  /** 順位から引いた CTR（0〜1） */
  ctr: number;
  /** 推定表示回数。月間検索数が不明なら null */
  impressions: number | null;
  /** 推定クリック数。同上 */
  clicks: number | null;
}

/** 画面に出すまとめ */
export interface SearchEstimate {
  domain: string;
  /** 取得した時刻（ISO） */
  fetchedAt: string;
  /** 取得できたキーワードの総数 */
  keywords: number;
  /** 月間検索数が分かっていて推定に使えた数 */
  counted: number;
  /** 推定表示回数の合計 */
  impressions: number;
  /** 推定クリック数の合計 */
  clicks: number;
  /** 推定 CTR（クリック ÷ 表示回数）。表示回数が 0 なら null */
  ctr: number | null;
  /** 検索数で重み付けした平均順位。重みが無ければ null */
  averageRank: number | null;
  /** 順位帯ごとのキーワード数 */
  top3: number;
  top10: number;
  top50: number;
  /** 推定クリックの多い順 */
  rows: EstimatedRow[];
}
