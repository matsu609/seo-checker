/**
 * 構造化出力（zod スキーマどおりの JSON を返させる）の薄いラッパー。
 * 既存の FAQ 生成（src/lib/faq/generate.ts）と同じ
 * `client.messages.parse({ output_config: { format: zodOutputFormat(schema) } })` を使う。
 */
import type Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";
import { getAnthropicClient, MODELS, StructuredOutputError, type ModelKind } from "./anthropic";

export interface StructuredOptions<S extends z.ZodType> {
  schema: S;
  /** 1 本の文字列なら user メッセージ 1 つ。会話を渡したいときは messages */
  prompt: string | Anthropic.Messages.MessageParam[];
  system?: string;
  /** MODELS のキー、または直接モデル ID。既定 "default" */
  model?: ModelKind | (string & {});
  maxTokens?: number;
  temperature?: number;
  /** Web 検索などのサーバーツール */
  tools?: Anthropic.Messages.ToolUnion[];
  /** 打ち切り */
  signal?: AbortSignal;
}

export interface StructuredResult<T> {
  data: T;
  /** 引用・検索クエリの取り出し用に元メッセージも返す */
  message: Anthropic.Messages.Message;
  usage: { inputTokens: number; outputTokens: number };
}

function resolveModel(model: StructuredOptions<z.ZodType>["model"]): string {
  if (!model) return MODELS.default;
  if (model in MODELS) return MODELS[model as ModelKind];
  return model;
}

/**
 * スキーマどおりの JSON を生成して返す。解釈できなければ StructuredOutputError。
 * SDK の例外はそのまま投げるので、Route Handler 側で toApiError に通す。
 */
export async function generateStructured<S extends z.ZodType>(
  options: StructuredOptions<S>,
): Promise<StructuredResult<z.infer<S>>> {
  const client = getAnthropicClient();
  const messages: Anthropic.Messages.MessageParam[] =
    typeof options.prompt === "string" ? [{ role: "user", content: options.prompt }] : options.prompt;

  const response = await client.messages.parse(
    {
      model: resolveModel(options.model),
      max_tokens: options.maxTokens ?? 4096,
      ...(options.system ? { system: options.system } : {}),
      ...(options.temperature !== undefined ? { temperature: options.temperature } : {}),
      ...(options.tools && options.tools.length > 0 ? { tools: options.tools } : {}),
      messages,
      output_config: { format: zodOutputFormat(options.schema) },
    },
    options.signal ? { signal: options.signal } : undefined,
  );

  if (response.stop_reason === "refusal") {
    throw new StructuredOutputError("AI がこの内容の生成を断りました");
  }
  if (response.stop_reason === "max_tokens") {
    throw new StructuredOutputError("AI の出力が長すぎて途中で切れました。入力を減らして再試行してください");
  }
  const parsed = response.parsed_output;
  if (parsed === null || parsed === undefined) {
    throw new StructuredOutputError();
  }
  return {
    data: parsed,
    message: response,
    usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
  };
}
