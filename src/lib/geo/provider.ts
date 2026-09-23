/**
 * 計測プロバイダの抽象（仕様書 §1.1「将来の自社スクレイピング切替に備える」）。
 *
 * 呼び出し側（バッチ・オンデマンド実行）はこのインターフェースだけを見る。
 * DataForSEO の実装は dataforseo.ts。未設定なら `getGeoProvider()` が null を返し、
 * 画面は「要設定」を出す（ダミーデータは返さない）。
 */
import type { GeoCitation, GeoModel, MeasurementKind, OrganicHit, RunMode } from "./types";

export interface ProviderRequest {
  kind: MeasurementKind;
  /** プロンプト文またはキーワード */
  text: string;
  model: GeoModel;
  locale: string;
  mode: RunMode;
  signal?: AbortSignal;
}

export interface ProviderResult {
  /** 回答本文。順位計測のときは空文字 */
  responseText: string;
  citations: GeoCitation[];
  /** 順位計測のときだけ。圏外は null */
  rank: number | null;
  /**
   * 自然検索の上位（検索結果を取ったときだけ）。共有の計測に残し、
   * 利用者ごとの順位は集計のときに引く（2026-09-23）
   */
  organic?: OrganicHit[] | null;
  /** 取得できた範囲のモデルバージョン（§5.3） */
  modelVersion: string | null;
  /** プロバイダが返した実費（取れなければ null。単価表から推定する） */
  costUsd: number | null;
}

export type ProviderFailure = "no-key" | "rate-limit" | "upstream" | "network" | "unsupported";

export interface ProviderOutcome {
  result: ProviderResult | null;
  failure: ProviderFailure | null;
  message: string | null;
}

export interface GeoProvider {
  readonly id: string;
  run(request: ProviderRequest): Promise<ProviderOutcome>;
}
