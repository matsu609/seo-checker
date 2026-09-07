/**
 * ブラウザ側のストリーム受信（NDJSON）。fetch は差し替えるのでネットワークには出ない。
 */
import { afterEach, describe, expect, it } from "vitest";
import { requestBody, requestRewrite } from "../client";
import type { BodyStreamEvent, ArticleOutline } from "../types";

const outline: ArticleOutline = {
  search_intent: "意図",
  audience: "読者",
  common_topics: [],
  missing_topics: [],
  title_suggestions: [],
  description_suggestions: [],
  outline: [{ h2: "見出し", h3: [], goal: "狙い", target_chars: 600 }],
};

/** NDJSON を指定のバイト位置で分割して返す Response */
function ndjsonResponse(lines: readonly unknown[], cuts: readonly number[] = []): Response {
  const text = lines.map((l) => JSON.stringify(l)).join("\n") + "\n";
  const bytes = new TextEncoder().encode(text);
  const bounds = [0, ...cuts, bytes.length];
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bounds.length - 1; i += 1) {
        controller.enqueue(bytes.slice(bounds[i], bounds[i + 1]));
      }
      controller.close();
    },
  });
  return new Response(stream, { status: 200, headers: { "content-type": "application/x-ndjson" } });
}

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("requestBody", () => {
  it("多バイト文字の途中でチャンクが切れても組み立てる", async () => {
    const lines: BodyStreamEvent[] = [
      { type: "section-start", index: 0, total: 1, h2: "見出し" },
      { type: "delta", index: 0, text: "日本語の本文です🙂" },
      { type: "section-end", index: 0, markdown: "## 見出し\n日本語の本文です🙂" },
      { type: "done", sections: 1, chars: 20 },
    ];
    const text = lines.map((l) => JSON.stringify(l)).join("\n") + "\n";
    // 「日」の 3 バイトのうち 1 バイト目の直後で切る
    const head = new TextEncoder().encode(text.slice(0, text.indexOf("日本語"))).length;
    globalThis.fetch = async () => ndjsonResponse(lines, [head + 1, head + 4]);

    const received: BodyStreamEvent[] = [];
    const markdown = await requestBody({
      keyword: "k",
      outline,
      tone: "desu",
      onEvent: (e) => received.push(e),
    });
    expect(received).toEqual(lines);
    expect(markdown).toBe("## 見出し\n日本語の本文です🙂");
  });

  it("section-end を段落区切りでつなぐ", async () => {
    const lines: BodyStreamEvent[] = [
      { type: "section-end", index: 0, markdown: "## 1本目\n本文" },
      { type: "section-end", index: 1, markdown: "## 2本目\n本文" },
      { type: "done", sections: 2, chars: 10 },
    ];
    globalThis.fetch = async () => ndjsonResponse(lines);
    const markdown = await requestBody({ keyword: "k", outline, tone: "desu", onEvent: () => {} });
    expect(markdown).toBe("## 1本目\n本文\n\n## 2本目\n本文");
  });

  it("途中で中止すると AbortError になる（受信済みの分は onEvent に届いている）", async () => {
    const controller = new AbortController();
    globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(streamController) {
          streamController.enqueue(
            encoder.encode(JSON.stringify({ type: "delta", index: 0, text: "途中まで" }) + "\n"),
          );
          // 以降は送らず、中止シグナルでエラーにする
          init?.signal?.addEventListener("abort", () => streamController.error(new DOMException("Aborted", "AbortError")));
        },
      });
      return new Response(stream, { status: 200 });
    };

    const received: BodyStreamEvent[] = [];
    const promise = requestBody({
      keyword: "k",
      outline,
      tone: "desu",
      signal: controller.signal,
      onEvent: (e) => {
        received.push(e);
        controller.abort();
      },
    });
    await expect(promise).rejects.toThrow();
    expect(received).toEqual([{ type: "delta", index: 0, text: "途中まで" }]);
  });

  it("エラー行だけが返ったら例外にする", async () => {
    globalThis.fetch = async () => ndjsonResponse([{ type: "error", error: "生成に失敗しました" }]);
    await expect(
      requestBody({ keyword: "k", outline, tone: "desu", onEvent: () => {} }),
    ).rejects.toThrow("生成に失敗しました");
  });

  it("HTTP エラーは body の error をそのまま伝える", async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY が必要です" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      });
    await expect(
      requestBody({ keyword: "k", outline, tone: "desu", onEvent: () => {} }),
    ).rejects.toThrow("ANTHROPIC_API_KEY が必要です");
  });
});

describe("requestRewrite", () => {
  it("delta を連結して返す", async () => {
    globalThis.fetch = async () =>
      ndjsonResponse([
        { type: "delta", text: "書き" },
        { type: "delta", text: "換え後" },
        { type: "done" },
      ]);
    const deltas: string[] = [];
    const text = await requestRewrite({
      target: "元の文",
      instruction: "校正して",
      onDelta: (d) => deltas.push(d),
    });
    expect(text).toBe("書き換え後");
    expect(deltas).toEqual(["書き", "換え後"]);
  });

  it("error 行があれば例外にする", async () => {
    globalThis.fetch = async () => ndjsonResponse([{ type: "error", error: "失敗しました" }]);
    await expect(
      requestRewrite({ target: "元の文", instruction: "校正して", onDelta: () => {} }),
    ).rejects.toThrow("失敗しました");
  });
});
