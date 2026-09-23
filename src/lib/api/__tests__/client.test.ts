import { afterEach, describe, expect, it, vi } from "vitest";
import { apiErrorMessage, httpStatusMessage, requestFailedMessage, requestJson } from "../client";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("apiErrorMessage", () => {
  it("{ error: string } の文言をそのまま返す", async () => {
    expect(await apiErrorMessage(jsonResponse({ error: "店舗が見つかりません" }, 404), requestFailedMessage)).toBe("店舗が見つかりません");
  });

  it("error が空・文字列でない・無いときは fallback（関数ならステータスを渡す）", async () => {
    expect(await apiErrorMessage(jsonResponse({ error: "" }, 500), requestFailedMessage)).toBe("リクエストに失敗しました（HTTP 500）");
    expect(await apiErrorMessage(jsonResponse({ error: { code: "x" } }, 502), requestFailedMessage)).toBe("リクエストに失敗しました（HTTP 502）");
    expect(await apiErrorMessage(jsonResponse({}, 400), httpStatusMessage)).toBe("HTTP 400");
    expect(await apiErrorMessage(jsonResponse(null, 503), httpStatusMessage)).toBe("HTTP 503");
  });

  it("JSON でない応答（プロキシのエラーページなど）は fallback", async () => {
    const res = new Response("<html>Bad Gateway</html>", { status: 502 });
    expect(await apiErrorMessage(res, requestFailedMessage)).toBe("リクエストに失敗しました（HTTP 502）");
  });

  it("fallback は文字列でも渡せる", async () => {
    expect(await apiErrorMessage(new Response("", { status: 500 }), "保存できませんでした")).toBe("保存できませんでした");
  });
});

describe("requestJson", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch(res: () => Response) {
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => res());
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("キャッシュを使わず、本文があるときだけ content-type を付ける", async () => {
    const fetchMock = stubFetch(() => jsonResponse({ ok: true }, 200));
    await requestJson("/api/a", undefined, requestFailedMessage);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/a", { cache: "no-store", headers: {} });

    await requestJson("/api/a", { method: "POST", body: "{}" }, requestFailedMessage);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/a", {
      cache: "no-store",
      method: "POST",
      body: "{}",
      headers: { "content-type": "application/json" },
    });
  });

  it("呼び出し側のヘッダーと中止シグナルを優先する", async () => {
    const fetchMock = stubFetch(() => jsonResponse({ ok: true }, 200));
    const ac = new AbortController();
    await requestJson("/api/a", { method: "PUT", body: "x", headers: { "content-type": "text/plain" }, signal: ac.signal }, requestFailedMessage);
    expect(fetchMock).toHaveBeenLastCalledWith("/api/a", {
      cache: "no-store",
      method: "PUT",
      body: "x",
      signal: ac.signal,
      headers: { "content-type": "text/plain" },
    });
  });

  it("成功なら JSON を返し、204 は undefined", async () => {
    stubFetch(() => jsonResponse({ items: [1, 2] }, 200));
    expect(await requestJson<{ items: number[] }>("/api/a", undefined, requestFailedMessage)).toEqual({ items: [1, 2] });

    stubFetch(() => new Response(null, { status: 204 }));
    expect(await requestJson("/api/a", { method: "DELETE" }, requestFailedMessage)).toBeUndefined();
  });

  it("失敗はエラー文（無ければ fallback）で投げる", async () => {
    stubFetch(() => jsonResponse({ error: "上限に達しました" }, 429));
    await expect(requestJson("/api/a", undefined, requestFailedMessage)).rejects.toThrow("上限に達しました");

    stubFetch(() => new Response("oops", { status: 500 }));
    await expect(requestJson("/api/a", undefined, httpStatusMessage)).rejects.toThrow("HTTP 500");
  });
});
