import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** /api/integrations の応答を作る */
function payload(extra: Record<string, unknown> = {}) {
  return {
    anthropic: true,
    ahrefs: false,
    status: { anthropic: true, ahrefs: false },
    keyExpiry: {},
    ...extra,
  };
}

/** モジュール内のキャッシュを毎回まっさらにして読み込む */
async function freshModule() {
  vi.resetModules();
  return import("../useIntegrations");
}

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

describe("連携状況の取得", () => {
  let calls: number;

  beforeEach(() => {
    calls = 0;
  });

  function stub(body: () => unknown) {
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response(JSON.stringify(body()), { status: 200, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
  }

  it("2 回目はキャッシュを返し、取りに行かない", async () => {
    stub(() => payload());
    const { fetchIntegrations } = await freshModule();
    await fetchIntegrations();
    await fetchIntegrations();
    expect(calls).toBe(1);
  });

  it("force のときは必ず取り直す（「再確認」が効くこと）", async () => {
    stub(() => payload());
    const { fetchIntegrations } = await freshModule();
    await fetchIntegrations();
    await fetchIntegrations(true);
    await fetchIntegrations(true);
    expect(calls).toBe(3);
  });

  it("force は進行中の取得を使い回さない（新しい値が返る）", async () => {
    let ahrefs = false;
    stub(() => payload({ ahrefs, status: { anthropic: true, ahrefs } }));
    const { fetchIntegrations } = await freshModule();
    const first = fetchIntegrations(); // 取得を始めたまま待たない
    ahrefs = true; // その間にサーバー側で設定された
    const forced = await fetchIntegrations(true);
    await first;
    expect(forced.status.ahrefs).toBe(true);
    expect(calls).toBe(2);
  });

  it("status が無い古い形の応答でも読める", async () => {
    stub(() => ({ anthropic: true, ahrefs: false }));
    const { fetchIntegrations } = await freshModule();
    const p = await fetchIntegrations();
    expect(p.status.anthropic).toBe(true);
    expect(p.status.ahrefs).toBe(false);
    expect(p.keyExpiry).toEqual({});
  });

  it("キーの期限は連携ごとに読み取る", async () => {
    stub(() =>
      payload({
        ahrefs: true,
        status: { anthropic: true, ahrefs: true },
        keyExpiry: { ahrefs: { issuedAt: "2026-09-16", expiresAt: "2027-09-16", daysLeft: 365, level: "ok" } },
      }),
    );
    const { fetchIntegrations } = await freshModule();
    const p = await fetchIntegrations();
    expect(p.keyExpiry.ahrefs?.daysLeft).toBe(365);
    expect(p.keyExpiry.ahrefs?.level).toBe("ok");
  });

  it("失敗しても例外は投げるが、キャッシュは汚さない", async () => {
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response("", { status: 500 });
    }) as unknown as typeof fetch;
    const { fetchIntegrations } = await freshModule();
    await expect(fetchIntegrations()).rejects.toThrow("HTTP 500");
    // 失敗を握ったまま返し続けないこと（次はもう一度取りに行く）
    await expect(fetchIntegrations()).rejects.toThrow("HTTP 500");
    expect(calls).toBe(2);
  });
});
