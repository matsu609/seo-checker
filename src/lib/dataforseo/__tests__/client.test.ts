/**
 * DataForSEO の共通クライアント（2026-09-23 に 3 か所の重複をまとめた）。
 *
 * - 中断のリスナーを必ず外す・キャッシュしない・本文を読み終えるまで時間切れを効かせる
 * - HTTP 402（残高不足）と、本文で返る失敗（status_code 40000 番台）の種類を 1 か所で決める
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CitationError, parseOrganic, searchGoogle } from "@/lib/citations/dataforseo";
import { createDataForSeoProvider } from "@/lib/geo/dataforseo";
import { fetchTopDomains } from "@/lib/geo/mentions";
import { fetchRankedKeywords, SearchEstimateError } from "@/lib/search-estimate/dataforseo";
import { apiFailure, DataForSeoNetworkError, kindFromApiCode, kindFromHttpStatus, requestDataForSeo } from "../client";

beforeEach(() => {
  process.env.DATAFORSEO_LOGIN = "login";
  process.env.DATAFORSEO_PASSWORD = "password";
});
afterEach(() => {
  delete process.env.DATAFORSEO_LOGIN;
  delete process.env.DATAFORSEO_PASSWORD;
  vi.restoreAllMocks();
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/** 呼ばれた引数を覚えるダミーの fetch */
function recordingFetch(response: () => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return response();
  }) as unknown as typeof fetch;
  return { impl, calls };
}

/** add / remove を数える AbortSignal もどき */
function countingSignal() {
  const controller = new AbortController();
  const added = vi.spyOn(controller.signal, "addEventListener");
  const removed = vi.spyOn(controller.signal, "removeEventListener");
  return { signal: controller.signal, added, removed };
}

describe("送信", () => {
  it("Basic 認証・タスクの配列・キャッシュしない", async () => {
    const f = recordingFetch(() => json({ tasks: [] }));
    const res = await requestDataForSeo("/x/live", [{ keyword: "a" }], { fetchImpl: f.impl });
    expect(res).toEqual({ ok: true, status: 200, payload: { tasks: [] } });
    expect(f.calls[0].url).toBe("https://api.dataforseo.com/v3/x/live");
    expect(f.calls[0].init.cache).toBe("no-store");
    expect(f.calls[0].init.body).toBe(JSON.stringify([{ keyword: "a" }]));
    expect((f.calls[0].init.headers as Record<string, string>).authorization).toBe(`Basic ${Buffer.from("login:password").toString("base64")}`);
  });

  it("呼び出し側の中断のリスナーは終わったら外す（成功でも失敗でも）", async () => {
    const ok = countingSignal();
    await requestDataForSeo("/x", [{}], { fetchImpl: recordingFetch(() => json({})).impl, signal: ok.signal });
    expect(ok.added).toHaveBeenCalledTimes(1);
    expect(ok.removed).toHaveBeenCalledTimes(1);

    const ng = countingSignal();
    const failing = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    await expect(requestDataForSeo("/x", [{}], { fetchImpl: failing, signal: ng.signal })).rejects.toBeInstanceOf(DataForSeoNetworkError);
    expect(ng.removed).toHaveBeenCalledTimes(1);
  });

  it("本文の読み込みが止まっても、時間切れで打ち切る（タイマーを先に止めない）", async () => {
    const stalled = (async (_url: string, init: RequestInit) => ({
      ok: true,
      status: 200,
      json: () =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
        }),
    })) as unknown as typeof fetch;
    const err = await requestDataForSeo("/x", [{}], { fetchImpl: stalled, timeoutMs: 20 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DataForSeoNetworkError);
    expect((err as DataForSeoNetworkError).timedOut).toBe(true);
    expect((err as Error).message).toBe("DataForSEO への接続がタイムアウトしました");
  });

  it("JSON でない成功応答は payload = null（例外にしない）", async () => {
    const res = await requestDataForSeo("/x", [{}], { fetchImpl: recordingFetch(() => new Response("<html>", { status: 200 })).impl });
    expect(res.payload).toBeNull();
  });
});

describe("失敗の種類", () => {
  it("HTTP: 401/403 = 認証、402/429 = 残高・回数、404 = パス、その他", () => {
    expect([401, 403, 402, 429, 404, 500].map(kindFromHttpStatus)).toEqual(["auth", "auth", "quota", "quota", "not-found", "upstream"]);
  });

  it("本文の status_code: 401xx = 認証、402xx = 残高・回数、404xx = パス", () => {
    expect([40100, 40200, 40202, 40400, 40501].map(kindFromApiCode)).toEqual(["auth", "quota", "quota", "not-found", "upstream"]);
  });

  it("全体と最初のタスクの両方を見る", () => {
    expect(apiFailure({ status_code: 40200, status_message: "Payment Required.", tasks: [] })).toEqual({ code: 40200, message: "Payment Required.", kind: "quota" });
    expect(apiFailure({ status_code: 20000, tasks: [{ status_code: 40501 }] })).toEqual({ code: 40501, message: "code 40501", kind: "upstream" });
    expect(apiFailure({ status_code: 20000, tasks: [{ status_code: 20100 }] })).toBeNull();
  });
});

describe("各機能の読み替え（文面は以前のまま）", () => {
  it("AI 検索モニタリング: 402 は残高不足としてバッチを止める側（rate-limit）に倒す", async () => {
    const provider = createDataForSeoProvider({ fetchImpl: recordingFetch(() => new Response("", { status: 402 })).impl });
    const out = await provider.run({ kind: "rank", text: "a", model: "aio", locale: "ja", mode: "standard" });
    expect(out).toEqual({ result: null, failure: "rate-limit", message: "DataForSEO の残高が足りません（HTTP 402）" });
  });

  it("AI 検索モニタリング: 本文で返る認証の失敗は「解釈できない」ではなく認証の失敗", async () => {
    const provider = createDataForSeoProvider({ fetchImpl: recordingFetch(() => json({ status_code: 40100, status_message: "You are not authorized" })).impl });
    const out = await provider.run({ kind: "aio", text: "a", model: "aio", locale: "ja", mode: "standard" });
    expect(out.failure).toBe("no-key");
    expect(out.message).toContain("認証に失敗しました");
  });

  it("AI 検索モニタリング: 429 と 404 の文面は以前と同じ", async () => {
    const at = (status: number) => createDataForSeoProvider({ fetchImpl: recordingFetch(() => new Response("", { status })).impl });
    expect((await at(429).run({ kind: "aio", text: "a", model: "aio", locale: "ja", mode: "standard" })).message).toBe("DataForSEO の回数制限に達しました");
    expect((await at(404).run({ kind: "aio", text: "a", model: "aio", locale: "ja", mode: "standard" })).failure).toBe("unsupported");
    expect((await at(500).run({ kind: "aio", text: "a", model: "aio", locale: "ja", mode: "standard" })).message).toBe("DataForSEO がエラーを返しました（HTTP 500）");
  });

  it("業界の地図: 402 は残高不足", async () => {
    const out = await fetchTopDomains({ keyword: "SEO", platform: "google" }, { fetchImpl: recordingFetch(() => new Response("", { status: 402 })).impl });
    expect(out).toEqual({ report: null, failure: "rate-limit", message: "DataForSEO の残高が足りません（HTTP 402）" });
  });

  it("サイテーション: 402 は quota、本文の残高不足も quota（以前は upstream）", async () => {
    await expect(searchGoogle("店名", { fetchImpl: recordingFetch(() => new Response("", { status: 402 })).impl })).rejects.toMatchObject({
      kind: "quota",
      message: "DataForSEO の残高または回数制限に達しました",
    });
    expect(() => parseOrganic({ tasks: [{ status_code: 40200, status_message: "Payment Required." }] })).toThrow(CitationError);
    try {
      parseOrganic({ tasks: [{ status_code: 40200, status_message: "Payment Required." }] });
    } catch (err) {
      expect((err as CitationError).kind).toBe("quota");
      expect((err as CitationError).message).toBe("DataForSEO がエラーを返しました（Payment Required.）");
    }
  });

  it("サイテーション: 届かなかったときの文面は以前と同じ", async () => {
    const failing = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    await expect(searchGoogle("店名", { fetchImpl: failing })).rejects.toMatchObject({ kind: "network", message: "DataForSEO に接続できませんでした" });
  });

  it("検索パフォーマンスの推定: 中断のリスナーを外し、キャッシュしない", async () => {
    const s = countingSignal();
    const f = recordingFetch(() => json({ tasks: [{ status_code: 20000, result: [{ items: [{ keyword_data: { keyword: "a", keyword_info: { search_volume: 10 } }, ranked_serp_element: { serp_item: { rank_group: 3, url: "https://x.jp/" } } }] }] }] }));
    const rows = await fetchRankedKeywords({ domain: "x.jp", fetchImpl: f.impl, signal: s.signal });
    expect(rows).toHaveLength(1);
    expect(s.removed).toHaveBeenCalledTimes(1);
    expect(f.calls[0].init.cache).toBe("no-store");
  });

  it("検索パフォーマンスの推定: 402 と、本文の認証の失敗", async () => {
    await expect(fetchRankedKeywords({ domain: "x.jp", fetchImpl: recordingFetch(() => new Response("", { status: 402 })).impl })).rejects.toMatchObject({ kind: "quota" });
    const err = await fetchRankedKeywords({ domain: "x.jp", fetchImpl: recordingFetch(() => json({ tasks: [{ status_code: 40100, status_message: "not authorized" }] })).impl }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SearchEstimateError);
    expect((err as SearchEstimateError).kind).toBe("auth");
  });
});
