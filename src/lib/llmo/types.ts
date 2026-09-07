/**
 * LLMO モニタリング（B4）・LLM リサーチ・クエリファンアウト（B8）の共通型。
 * サーバー（API ルート）とクライアント（ストア・画面）の両方から読む。
 */
import type { ProviderId } from "./providers/meta";

export type { ProviderId };

/** LLM の回答が挙げた参照元 */
export interface ProviderCitation {
  url: string;
  title: string | null;
}

/** 1 プロンプト × 1 モデルの呼び出しに成功したときの結果 */
export interface ProviderAnswer {
  ok: true;
  providerId: ProviderId;
  /** 実際に使ったモデル ID（ベンダー名ではなく識別子を残す） */
  model: string;
  answer: string;
  citations: ProviderCitation[];
  /** LLM が内部で発行した検索クエリ（ファンアウト）。取得できないモデルは空 */
  searchQueries: string[];
  usage?: { inputTokens: number; outputTokens: number };
}

/** 呼び出しに失敗したとき。プロバイダのモジュール外に例外を投げない代わりに返す */
export interface ProviderFailure {
  ok: false;
  providerId: ProviderId;
  model: string;
  /** 画面にそのまま出す日本語のメッセージ */
  error: string;
}

export type ProviderResult = ProviderAnswer | ProviderFailure;

/** 言及・引用の判定対象（自社と競合） */
export interface LlmoEntity {
  id: string;
  name: string;
  /** 例: ["example.co.jp"]（www. は付けても付けなくてもよい） */
  domains: string[];
  /** ブランドの表記ゆれ。例: ["ユーザーローカル", "User Local"] */
  brandAliases: string[];
  /** 自社かどうか（バッジ表示に使う） */
  isSelf?: boolean;
}

/** 1 回答 × 1 会社の判定結果 */
export interface EntityJudgement {
  entityId: string;
  brandMentioned: boolean;
  domainCited: boolean;
  /** 引用のうちこの会社に一致したドメイン */
  matchedDomains: string[];
  /** 言及の根拠になった別名（表記ゆれの確認用） */
  matchedAliases: string[];
}

/** どの会社にも一致しなかった引用ドメイン */
export interface UnclassifiedDomain {
  domain: string;
  count: number;
  /** 代表 URL（1 件だけ持つ。画面のリンク用） */
  sampleUrl: string;
  sampleTitle: string | null;
}

/**
 * 保存される 1 行（プロンプト × モデル × 日）。
 * 定点モニタリングも単発リサーチも同じ形で持ち、リサーチは researchId でまとめる。
 */
export interface LlmoRun {
  id: string;
  /** プロジェクト未選択のときは "" */
  projectId: string;
  /** YYYY-MM-DD */
  takenOn: string;
  /** ISO 8601 */
  measuredAt: string;
  promptId: string;
  promptText: string;
  providerId: ProviderId;
  model: string;
  status: "ok" | "error";
  error?: string;
  answer: string;
  citations: ProviderCitation[];
  searchQueries: string[];
  /** このモデルでファンアウトを取得できるか（false なら「対象外」と表示する） */
  fanoutSupported: boolean;
  judgements: EntityJudgement[];
  unclassified: UnclassifiedDomain[];
  /** 単発リサーチのときだけ入る */
  researchId?: string;
}

/** POST /api/llmo/run のリクエスト */
export interface LlmoRunRequest {
  prompts: Array<string | { id: string; text: string }>;
  models: ProviderId[];
  entities: LlmoEntity[];
}

/** POST /api/llmo/run が返す 1 行（保存前。id / projectId は画面側で付ける） */
export interface LlmoRunRow {
  promptId: string;
  promptText: string;
  providerId: ProviderId;
  model: string;
  status: "ok" | "error";
  error?: string;
  answer: string;
  citations: ProviderCitation[];
  searchQueries: string[];
  fanoutSupported: boolean;
  judgements: EntityJudgement[];
  unclassified: UnclassifiedDomain[];
  usage?: { inputTokens: number; outputTokens: number };
}

export interface LlmoRunResponse {
  takenOn: string;
  measuredAt: string;
  rows: LlmoRunRow[];
  /** 未設定などで実行しなかったモデル（画面の注意書き用） */
  skipped: Array<{ providerId: ProviderId; reason: string }>;
}

/** 1 回の呼び出しで許す プロンプト × モデル の上限 */
export const MAX_CALLS_PER_REQUEST = 40;
