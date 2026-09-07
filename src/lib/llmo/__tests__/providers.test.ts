/**
 * 各プロバイダの応答パーサ（手書きのフィクスチャのみ。ネットワークには出ない）。
 * 引用が無い / 回答が空 / エラー本文 のときに落ちないことを確かめる。
 */
import { describe, expect, it } from "vitest";
import { parseClaudeMessage } from "../providers/claude";
import { parseGeminiResponse } from "../providers/gemini";
import { parseOpenAiResponse } from "../providers/openai";
import { parsePerplexityResponse } from "../providers/perplexity";
import { errorMessageOf } from "../providers/http";
import { PROVIDERS_META, providerLabel } from "../providers/meta";
import { dedupeCitations, dedupeQueries, toAnswer } from "../providers/types";

describe("parseClaudeMessage", () => {
  const message = {
    content: [
      { type: "server_tool_use", name: "web_search", input: { query: "SEO ツール おすすめ 2026年" } },
      {
        type: "web_search_tool_result",
        content: [
          { type: "web_search_result", url: "https://a.example.com/1", title: "A の記事", page_age: "2026-08-01" },
          { type: "web_search_result", url: "https://b.example.com/2", title: "B の記事" },
        ],
      },
      {
        type: "text",
        text: "おすすめはサンプル社のツールです。",
        citations: [
          { type: "web_search_result_location", url: "https://a.example.com/1", title: "A の記事", cited_text: "サンプル社" },
        ],
      },
    ],
    usage: { input_tokens: 120, output_tokens: 45 },
  };

  it("本文・引用・検索クエリを取り出す", () => {
    const parsed = parseClaudeMessage(message);
    expect(parsed.answer).toBe("おすすめはサンプル社のツールです。");
    expect(parsed.searchQueries).toEqual(["SEO ツール おすすめ 2026年"]);
    // 本文の citations が先、検索結果はその後（重複は toAnswer で 1 件になる）
    expect(parsed.citations[0]).toEqual({ url: "https://a.example.com/1", title: "A の記事" });
    expect(toAnswer("claude", "claude-opus-5", parsed).citations.map((c) => c.url)).toEqual([
      "https://a.example.com/1",
      "https://b.example.com/2",
    ]);
    expect(parsed.usage).toEqual({ inputTokens: 120, outputTokens: 45 });
  });

  it("引用が無くても回答本文だけ返す", () => {
    const parsed = parseClaudeMessage({ content: [{ type: "text", text: "分かりません。" }] });
    expect(parsed.answer).toBe("分かりません。");
    expect(parsed.citations).toEqual([]);
    expect(parsed.searchQueries).toEqual([]);
  });

  it("検索がエラーになったブロックは無視する", () => {
    const parsed = parseClaudeMessage({
      content: [
        { type: "web_search_tool_result", content: { type: "web_search_tool_result_error", error_code: "max_uses_exceeded" } },
        { type: "text", text: "" },
      ],
    });
    expect(parsed.answer).toBe("");
    expect(parsed.citations).toEqual([]);
  });

  it("null や想定外の形でも落ちない", () => {
    expect(parseClaudeMessage(null).answer).toBe("");
    expect(parseClaudeMessage({ content: "x" }).citations).toEqual([]);
  });
});

describe("parseOpenAiResponse", () => {
  it("output_text の annotations と web_search_call のクエリを取り出す", () => {
    const parsed = parseOpenAiResponse({
      output: [
        { type: "web_search_call", status: "completed", action: { type: "search", query: "SEO ツール 比較" } },
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: "サンプル社が有名です。",
              annotations: [
                { type: "url_citation", url: "https://a.example.com/1", title: "A の記事" },
                { type: "file_citation", file_id: "f1" },
              ],
            },
          ],
        },
      ],
      usage: { input_tokens: 10, output_tokens: 20 },
    });
    expect(parsed.answer).toBe("サンプル社が有名です。");
    expect(parsed.citations).toEqual([{ url: "https://a.example.com/1", title: "A の記事" }]);
    expect(parsed.searchQueries).toEqual(["SEO ツール 比較"]);
  });

  it("annotations が無い応答でも本文だけ返す", () => {
    const parsed = parseOpenAiResponse({
      output: [{ type: "message", content: [{ type: "output_text", text: "回答です。" }] }],
    });
    expect(parsed.answer).toBe("回答です。");
    expect(parsed.citations).toEqual([]);
  });

  it("output が空なら output_text を使う", () => {
    expect(parseOpenAiResponse({ output: [], output_text: "短い回答" }).answer).toBe("短い回答");
  });

  it("エラー本文でも例外にならず空になる", () => {
    const payload = { error: { message: "Invalid API key", type: "invalid_request_error" } };
    expect(parseOpenAiResponse(payload).answer).toBe("");
    expect(errorMessageOf(payload)).toBe("Invalid API key");
  });
});

describe("parseGeminiResponse", () => {
  it("groundingChunks と webSearchQueries を取り出す", () => {
    const parsed = parseGeminiResponse({
      candidates: [
        {
          content: { parts: [{ text: "サンプル社が該当します。" }] },
          groundingMetadata: {
            groundingChunks: [
              { web: { uri: "https://a.example.com/1", title: "A の記事" } },
              { web: { uri: "https://b.example.com/2" } },
              { retrievedContext: { uri: "https://ignored.example.com" } },
            ],
            webSearchQueries: ["SEO ツール 最新", "AIO 対策とは"],
          },
        },
      ],
      usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 7 },
    });
    expect(parsed.answer).toBe("サンプル社が該当します。");
    expect(parsed.citations).toEqual([
      { url: "https://a.example.com/1", title: "A の記事" },
      { url: "https://b.example.com/2", title: null },
    ]);
    expect(parsed.searchQueries).toEqual(["SEO ツール 最新", "AIO 対策とは"]);
  });

  it("グラウンディングが無い応答でも落ちない", () => {
    const parsed = parseGeminiResponse({ candidates: [{ content: { parts: [{ text: "回答" }] } }] });
    expect(parsed.citations).toEqual([]);
    expect(parsed.searchQueries).toEqual([]);
  });

  it("candidates が空（安全性ブロック等）なら空文字", () => {
    expect(parseGeminiResponse({ candidates: [], promptFeedback: { blockReason: "SAFETY" } }).answer).toBe("");
    expect(parseGeminiResponse({ error: { code: 400, message: "API key not valid" } }).answer).toBe("");
  });
});

describe("parsePerplexityResponse", () => {
  it("search_results と citations の両方から引用を集める", () => {
    const parsed = parsePerplexityResponse({
      choices: [{ message: { role: "assistant", content: "サンプル社です。" } }],
      search_results: [{ title: "A の記事", url: "https://a.example.com/1" }],
      citations: ["https://a.example.com/1", "https://c.example.com/3"],
      usage: { prompt_tokens: 3, completion_tokens: 9 },
    });
    expect(parsed.answer).toBe("サンプル社です。");
    // 重複除去は toAnswer で行うのでここでは両方入っている
    expect(parsed.citations).toHaveLength(3);
    expect(toAnswer("perplexity", "sonar", parsed).citations.map((c) => c.url)).toEqual([
      "https://a.example.com/1",
      "https://c.example.com/3",
    ]);
  });

  it("検索クエリは常に空（API が返さない）", () => {
    expect(parsePerplexityResponse({ choices: [] }).searchQueries).toEqual([]);
    expect(PROVIDERS_META.perplexity.fanoutSupported).toBe(false);
  });

  it("content が配列の版でも本文を取れる", () => {
    const parsed = parsePerplexityResponse({
      choices: [{ message: { content: [{ type: "text", text: "配列形式の回答" }] } }],
    });
    expect(parsed.answer).toBe("配列形式の回答");
  });

  it("エラー本文なら空の回答になる", () => {
    expect(parsePerplexityResponse({ error: { message: "unauthorized" } }).answer).toBe("");
  });
});

describe("共通の後処理", () => {
  it("URL のクエリ・末尾スラッシュ違いを 1 件にまとめる", () => {
    const out = dedupeCitations([
      { url: "https://a.example.com/x/", title: "A" },
      { url: "https://a.example.com/x?utm=1", title: "A 別" },
      { url: "  ", title: null },
    ]);
    expect(out).toEqual([{ url: "https://a.example.com/x/", title: "A" }]);
  });

  it("検索クエリの重複と空白を落とす", () => {
    expect(dedupeQueries([" SEO ツール ", "SEO ツール", ""])).toEqual(["SEO ツール"]);
  });

  it("プロバイダのラベルを引ける", () => {
    expect(providerLabel("claude")).toBe("Claude");
    expect(providerLabel("unknown")).toBe("unknown");
  });
});
