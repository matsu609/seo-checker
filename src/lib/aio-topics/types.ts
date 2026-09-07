/**
 * AIO 頻出トピック（A5）の API の入出力型。
 * サーバー（route.ts）とクライアント（画面）の両方から参照する。
 */
import type { AioReference, SerpDevice } from "@/lib/rank/types";
import type { Coverage } from "./aggregate";

export interface ExtractedTopicDto {
  label: string;
  evidence: string;
}

/** POST /api/aio-topics のレスポンス */
export interface AioTopicsResponse {
  keyword: string;
  device: SerpDevice;
  /** 取得日（YYYY-MM-DD） */
  takenOn: string;
  aioPresent: boolean;
  selfCited: boolean;
  references: AioReference[];
  /** AIO 本文（表示されていなければ null） */
  text: string | null;
  topics: ExtractedTopicDto[];
  /** 抽出に使ったモデル（画面の注記用） */
  model: string;
  fetchedAt: string;
}

/** POST /api/aio-topics/coverage のレスポンス */
export interface CoverageResponse {
  pageUrl: string;
  judgements: Array<{ label: string; coverage: Coverage; reason?: string }>;
  model: string;
  cached: boolean;
}
