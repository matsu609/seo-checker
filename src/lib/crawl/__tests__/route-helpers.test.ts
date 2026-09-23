/**
 * ルートの共通部品（2026-09-23 に複製をまとめた）。
 *   - fetch-response.ts: FetchError の応答・入力 URL の検査・キャッシュのキー
 *   - crawl/gate.ts: クロールの同時実行の枠（名前ごとに別に数える）
 *   - crawl/stream.ts: NDJSON 応答（nosniff・切断後は書かない）
 */
import { describe, expect, it } from "vitest";
import { FetchError } from "@/lib/analyzer/fetch";
import { fetchErrorResponse, fetchErrorStatus, publicUrlError, urlCacheKey } from "@/lib/analyzer/fetch-response";
import { acquireCrawlSlot, crawlClientKey, MAX_CONCURRENT_CRAWLS } from "../gate";
import { NDJSON_HEADERS, ndjsonResponse, ndjsonSingle } from "../stream";

describe("fetch-response", () => {
  it("invalid_url と blocked_host は 400、それ以外は 502（多数派のルートと同じ）", () => {
    expect(fetchErrorStatus(new FetchError("x", "invalid_url"))).toBe(400);
    expect(fetchErrorStatus(new FetchError("x", "blocked_host"))).toBe(400);
    expect(fetchErrorStatus(new FetchError("x", "timeout"))).toBe(502);
    expect(fetchErrorStatus(new FetchError("x", "network"))).toBe(502);
    expect(fetchErrorStatus(new FetchError("x", "too_large"))).toBe(502);
  });

  it("応答は { error, code } で文言はそのまま", async () => {
    const res = fetchErrorResponse(new FetchError("URLの形式が正しくありません", "invalid_url"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "URLの形式が正しくありません", code: "invalid_url" });
  });

  it("入力 URL の検査: 形式の誤りと内部ネットワークは 400、公開の IP は通す", async () => {
    expect((await publicUrlError("ftp://example.com"))?.status).toBe(400);
    const blocked = await publicUrlError("http://127.0.0.1/");
    expect(blocked?.status).toBe(400);
    expect(await blocked?.json()).toMatchObject({ code: "blocked_host" });
    expect(await publicUrlError("https://93.184.215.14/")).toBeNull();
  });

  it("キャッシュのキーはスキームとホストだけを小文字にする（パスの大文字小文字は残す）", () => {
    expect(urlCacheKey("HTTPS://Example.COM/About")).toBe("https://example.com/About");
    expect(urlCacheKey("example.com/About")).toBe("https://example.com/About");
    expect(urlCacheKey("https://example.com/About")).not.toBe(urlCacheKey("https://example.com/about"));
    expect(urlCacheKey("https://example.com")).toBe(urlCacheKey("example.com/"));
  });
});

describe("crawl/gate", () => {
  it("同時 2 本・同一クライアント 1 本。名前ごとに別に数える", () => {
    const a = acquireCrawlSlot("llms-scan", "client-a");
    expect(a).not.toBeNull();
    // 同じクライアントの 2 本目は断る
    expect(acquireCrawlSlot("llms-scan", "client-a")).toBeNull();
    const b = acquireCrawlSlot("llms-scan", "client-b");
    expect(b).not.toBeNull();
    expect(MAX_CONCURRENT_CRAWLS).toBe(2);
    // 全体の上限
    expect(acquireCrawlSlot("llms-scan", "client-c")).toBeNull();
    // 別の名前の枠は影響を受けない
    const other = acquireCrawlSlot("site", "client-a");
    expect(other).not.toBeNull();
    other?.();
    a?.();
    a?.(); // 2 回呼んでも 1 回分だけ解放する
    expect(acquireCrawlSlot("llms-scan", "client-b")).toBeNull();
    const c = acquireCrawlSlot("llms-scan", "client-c");
    expect(c).not.toBeNull();
    b?.();
    c?.();
  });

  it("クライアントの識別子は x-forwarded-for の先頭 → x-real-ip → unknown", () => {
    expect(crawlClientKey(new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBe("1.2.3.4");
    expect(crawlClientKey(new Headers({ "x-real-ip": "9.9.9.9" }))).toBe("9.9.9.9");
    expect(crawlClientKey(new Headers())).toBe("unknown");
  });
});

describe("crawl/stream", () => {
  it("共通のヘッダー（nosniff を含む）で 1 行ずつ流す", async () => {
    const res = ndjsonResponse<{ n: number }>(async (sink) => {
      sink.send({ n: 1 });
      sink.send({ n: 2 });
    });
    for (const [k, v] of Object.entries(NDJSON_HEADERS)) expect(res.headers.get(k)).toBe(v);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await res.text()).toBe('{"n":1}\n{"n":2}\n');
    expect(await ndjsonSingle({ ok: true }).text()).toBe('{"ok":true}\n');
  });

  it("読み手が切断したあとの send は例外を出さず、closed になり、onCancel が呼ばれる", async () => {
    let cancelled = false;
    let afterCancel: (() => void) | null = null;
    let closedSeen = false;
    const finished = new Promise<void>((resolve) => {
      afterCancel = resolve;
    });
    const res = ndjsonResponse<{ n: number }>(
      async (sink) => {
        sink.send({ n: 1 });
        await new Promise((r) => setTimeout(r, 30));
        // ここで読み手はもういない
        sink.send({ n: 2 });
        closedSeen = sink.closed;
        afterCancel?.();
      },
      { onCancel: () => (cancelled = true) },
    );
    const reader = res.body!.getReader();
    await reader.read();
    await reader.cancel();
    await finished;
    expect(cancelled).toBe(true);
    expect(closedSeen).toBe(true);
  });
});
