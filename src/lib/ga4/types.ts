/**
 * GA4 Data API（runReport）の共通型とエラー。
 *
 * サーバー（/api/ai-traffic・/api/site-report）とクライアント（画面）の両方から
 * 参照するので、ここにはネットワークにも localStorage にも触らない型と定数だけを置く。
 */

/** 何が原因で失敗したか。Route Handler はこれを HTTP ステータスに写す */
export type Ga4ErrorCode = "config" | "auth" | "not_found" | "rate_limit" | "upstream";

/** code ごとの HTTP ステータス（ARCHITECTURE.md の規約: 未設定 503 / 上流 502） */
export const GA4_ERROR_STATUS: Record<Ga4ErrorCode, number> = {
  config: 503,
  auth: 502,
  not_found: 502,
  rate_limit: 429,
  upstream: 502,
};

export class Ga4Error extends Error {
  constructor(
    message: string,
    public readonly code: Ga4ErrorCode,
    /** 上流の HTTP ステータス（分かるときだけ） */
    public readonly upstreamStatus?: number,
  ) {
    super(message);
    this.name = "Ga4Error";
  }

  /** この機能の API が返すべき HTTP ステータス */
  get status(): number {
    return GA4_ERROR_STATUS[this.code];
  }
}

/** サービスアカウント JSON のうち、実際に使うフィールドだけ */
export interface ServiceAccount {
  clientEmail: string;
  /** PEM（-----BEGIN PRIVATE KEY----- …） */
  privateKey: string;
  /** 既定は https://oauth2.googleapis.com/token */
  tokenUri: string;
}

/** runReport の日付範囲。GA4 は YYYY-MM-DD */
export interface Ga4DateRange {
  startDate: string;
  endDate: string;
  /** 複数期間を渡したときに dateRange ディメンションへ入る名前 */
  name?: string;
}

export interface Ga4FilterExpression {
  andGroup?: { expressions: Ga4FilterExpression[] };
  orGroup?: { expressions: Ga4FilterExpression[] };
  notExpression?: Ga4FilterExpression;
  filter?: {
    fieldName: string;
    stringFilter?: { matchType?: "EXACT" | "BEGINS_WITH" | "CONTAINS" | "FULL_REGEXP"; value: string; caseSensitive?: boolean };
    inListFilter?: { values: string[]; caseSensitive?: boolean };
  };
}

/** runReport のリクエスト本文（使うフィールドだけを型にする） */
export interface Ga4RunReportBody {
  dateRanges: Ga4DateRange[];
  dimensions?: Array<{ name: string }>;
  metrics?: Array<{ name: string }>;
  dimensionFilter?: Ga4FilterExpression;
  orderBys?: Array<
    | { dimension: { dimensionName: string }; desc?: boolean }
    | { metric: { metricName: string }; desc?: boolean }
  >;
  limit?: number;
  offset?: number;
  keepEmptyRows?: boolean;
}

/** 1 行。ディメンション・メトリクスとも文字列で返るので、数値化は呼び出し側の責務 */
export interface Ga4Row {
  dimensionValues: string[];
  metricValues: string[];
}

/** runReport の応答（使うところだけ） */
export interface Ga4Report {
  dimensionHeaders: string[];
  metricHeaders: string[];
  rows: Ga4Row[];
  rowCount: number;
}

export interface Ga4Client {
  readonly propertyId: string;
  runReport(body: Ga4RunReportBody): Promise<Ga4Report>;
}
