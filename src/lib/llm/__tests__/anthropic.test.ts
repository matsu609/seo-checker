import { describe, expect, it } from "vitest";
import { extractCitations, extractSearchQueries, extractSearchResults, extractText, WEB_SEARCH_TOOL } from "../anthropic";

/** Web 検索を使った回答の形（SDK の型に合わせた手書きの例） */
const message = {
  content: [
    { type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: { query: "LLMO とは" } },
    {
      type: "web_search_tool_result",
      tool_use_id: "srvtoolu_1",
      content: [
        { type: "web_search_result", url: "https://example.com/llmo", title: "LLMO 入門", encrypted_content: "x", page_age: "2026-01-01" },
        { type: "web_search_result", url: "https://example.com/llmo/", title: "重複", encrypted_content: "x", page_age: null },
      ],
    },
    { type: "server_tool_use", id: "srvtoolu_2", name: "web_search", input: { query: "LLMO とは" } },
    { type: "web_search_tool_result", tool_use_id: "srvtoolu_2", content: { type: "web_search_tool_result_error", error_code: "max_uses_exceeded" } },
    { type: "text", text: "LLMO とは", citations: null },
    {
      type: "text",
      text: "AI 検索向けの最適化です。",
      citations: [
        { type: "web_search_result_location", url: "https://example.com/llmo?utm=1", title: "LLMO 入門", cited_text: "AI 検索向け", encrypted_index: "e" },
        { type: "char_location", document_index: 0, start_char_index: 0, end_char_index: 3, cited_text: "x" },
      ],
    },
  ],
};

describe("anthropic helpers", () => {
  it("WEB_SEARCH_TOOL の形", () => {
    expect(WEB_SEARCH_TOOL).toEqual({ type: "web_search_20260209", name: "web_search", max_uses: 5 });
  });

  it("extractSearchQueries は重複を除く", () => {
    expect(extractSearchQueries(message)).toEqual(["LLMO とは"]);
  });

  it("extractSearchResults は URL の末尾スラッシュ違いを 1 つにし、エラー結果を飛ばす", () => {
    expect(extractSearchResults(message)).toEqual([
      { url: "https://example.com/llmo", title: "LLMO 入門", pageAge: "2026-01-01" },
    ]);
  });

  it("extractCitations は web_search_result_location だけ拾う", () => {
    expect(extractCitations(message)).toEqual([
      { url: "https://example.com/llmo?utm=1", title: "LLMO 入門", citedText: "AI 検索向け" },
    ]);
  });

  it("extractText は text ブロックを連結", () => {
    expect(extractText(message)).toBe("LLMO とはAI 検索向けの最適化です。");
  });

  it("壊れた入力でも落ちない", () => {
    expect(extractCitations(null)).toEqual([]);
    expect(extractSearchQueries({ content: "x" })).toEqual([]);
    expect(extractSearchResults({ content: [null, 1, { type: "web_search_tool_result", content: [{}] }] })).toEqual([]);
  });
});
