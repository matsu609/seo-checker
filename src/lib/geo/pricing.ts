/**
 * 単価と為替（仕様書 §0.2 / §1.1）。
 *
 * **単価はコードに直書きせず、この 1 か所（= 設定テーブル）に集める。**
 * 環境変数で上書きできるので、DataForSEO の値上げや為替の変動に
 * デプロイだけで追随できる（計算式は触らない）。
 */
import { isLiveOnlyModel } from "./types";
import type { GeoModel, MeasurementKind, RunMode } from "./types";

/** 1 USD = 何円か（§0.2。既定 160、`GEO_USD_JPY` で変更） */
export const DEFAULT_USD_JPY = 160;

/** 変動費のうちバッファとして予約する割合（§0.2。リトライ・障害・為替） */
export const COST_BUFFER_RATIO = 0.1;

/** 1 アカウントあたりの月間原価の上限（§0.2） */
export const MONTHLY_COST_CAP_JPY = 3000;

/** 単価（USD）。既定値は仕様書 §1.1 の DataForSEO 準拠 */
export interface UnitPrices {
  /** SERP Advanced（検索順位）。1 キーワード */
  rank: number;
  /** SERP Advanced + load_async_ai_overview。1 キーワード */
  aio: number;
  /**
   * Google AI モード（/serp/google/ai_mode/live/advanced）。1 キーワード。
   * **単価は未確認**（この環境から dataforseo.com に出られない）。SERP Advanced と
   * 同じ 0.002 を仮に置き、`GEO_PRICE_AI_MODE_USD` で直せるようにしてある
   */
  aiMode: number;
  /** LLM Scraper 標準キュー。1 回 */
  llmStandard: number;
  /** LLM Scraper 優先キュー。1 回（**使用しない**。誤用検知のために置く） */
  llmPriority: number;
  /** LLM Scraper Live。1 回（手動オンデマンドのみ） */
  llmLive: number;
}

export const DEFAULT_UNIT_PRICES: UnitPrices = {
  rank: 0.002,
  aio: 0.0026,
  aiMode: 0.002,
  llmStandard: 0.0012,
  llmPriority: 0.0024,
  llmLive: 0.004,
};

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (typeof raw !== "string" || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** 為替。設定値として外出しする（§0.2） */
export function usdJpy(): number {
  const rate = envNumber("GEO_USD_JPY", DEFAULT_USD_JPY);
  return rate > 0 ? rate : DEFAULT_USD_JPY;
}

/** いまの単価表。環境変数で 1 つずつ上書きできる */
export function unitPrices(): UnitPrices {
  return {
    rank: envNumber("GEO_PRICE_RANK_USD", DEFAULT_UNIT_PRICES.rank),
    aio: envNumber("GEO_PRICE_AIO_USD", DEFAULT_UNIT_PRICES.aio),
    aiMode: envNumber("GEO_PRICE_AI_MODE_USD", DEFAULT_UNIT_PRICES.aiMode),
    llmStandard: envNumber("GEO_PRICE_LLM_STANDARD_USD", DEFAULT_UNIT_PRICES.llmStandard),
    llmPriority: envNumber("GEO_PRICE_LLM_PRIORITY_USD", DEFAULT_UNIT_PRICES.llmPriority),
    llmLive: envNumber("GEO_PRICE_LLM_LIVE_USD", DEFAULT_UNIT_PRICES.llmLive),
  };
}

/**
 * 計測 1 回の原価（USD）。prices を渡せるので純関数としてテストできる。
 *
 * `model` を渡すと **Perplexity は標準キューが無いので必ず Live 単価**で数える
 * （渡さなければ従来どおり mode だけで決める）。
 */
export function costUsd(kind: MeasurementKind, mode: RunMode, prices: UnitPrices = unitPrices(), model?: GeoModel): number {
  if (kind === "rank") return prices.rank;
  if (kind === "aio") return prices.aio;
  if (kind === "ai_mode") return prices.aiMode;
  const live = mode === "live" || (model !== undefined && isLiveOnlyModel(model));
  return live ? prices.llmLive : prices.llmStandard;
}

export function toJpy(usd: number, rate: number = usdJpy()): number {
  return usd * rate;
}

/** 表示用。小数 2 桁までの円 */
export function formatJpy(usd: number, rate: number = usdJpy()): string {
  const yen = toJpy(usd, rate);
  return `¥${yen < 10 ? yen.toFixed(2) : Math.round(yen).toLocaleString("ja-JP")}`;
}
