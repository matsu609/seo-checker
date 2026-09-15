import { afterEach, describe, expect, it } from "vitest";
import { AHREFS_DR_ENDPOINT, fetchAhrefsDr, isAhrefsEnabled, parseAhrefsDr } from "../ahrefs";

const KEY = "AHREFS_API_KEY";
const original = process.env[KEY];

afterEach(() => {
  if (original === undefined) delete process.env[KEY];
  else process.env[KEY] = original;
});

describe("Ahrefs DR の読み取り", () => {
  it("入れ子の応答から DR と利用条件を取る", () => {
    expect(parseAhrefsDr("example.com", { domain_rating: { domain_rating: 46.0, license: "http://ahrefs.com/legal/domain-rating-license" } })).toEqual({
      domain: "example.com",
      rating: 46,
      license: "http://ahrefs.com/legal/domain-rating-license",
    });
  });

  it("平たい形でも読める（仕様が変わっても落ちない）", () => {
    expect(parseAhrefsDr("example.com", { domain_rating: 97 })).toEqual({ domain: "example.com", rating: 97, license: null });
  });

  it("形が違えば null", () => {
    expect(parseAhrefsDr("example.com", null)).toBeNull();
    expect(parseAhrefsDr("example.com", { error: "not found" })).toBeNull();
  });
});

describe("Ahrefs DR の取得", () => {
  it("キーが無ければ呼ばずに no-key", async () => {
    delete process.env[KEY];
    expect(isAhrefsEnabled()).toBe(false);
    const outcome = await fetchAhrefsDr("example.com", {
      fetchImpl: (() => {
        throw new Error("呼んではいけない");
      }) as unknown as typeof fetch,
    });
    expect(outcome.failure).toBe("no-key");
  });

  it("登録ドメインを target に付け、キーは Bearer で送る", async () => {
    process.env[KEY] = "test-key";
    let url = "";
    let headers: Record<string, string> = {};
    const spy = (async (u: string, init: RequestInit) => {
      url = u;
      headers = init.headers as Record<string, string>;
      return new Response(JSON.stringify({ domain_rating: { domain_rating: 12.5, license: "http://ahrefs.com/legal/domain-rating-license" } }), { status: 200 });
    }) as unknown as typeof fetch;
    const outcome = await fetchAhrefsDr("ahrefs-test-1.example", { fetchImpl: spy });
    expect(url).toBe(`${AHREFS_DR_ENDPOINT}?target=ahrefs-test-1.example&output=json`);
    expect(headers.authorization).toBe("Bearer test-key");
    expect(outcome.result?.rating).toBe(12.5);
  });

  it("ドメイン以外は投げずに invalid", async () => {
    process.env[KEY] = "test-key";
    const outcome = await fetchAhrefsDr("example.com/../secret", {
      fetchImpl: (() => {
        throw new Error("呼んではいけない");
      }) as unknown as typeof fetch,
    });
    expect(outcome.failure).toBe("invalid");
  });

  it("401 はキーの問題だと分かる文言にする", async () => {
    process.env[KEY] = "test-key";
    const outcome = await fetchAhrefsDr("ahrefs-test-2.example", {
      fetchImpl: (async () => new Response("", { status: 401 })) as unknown as typeof fetch,
    });
    expect(outcome.failure).toBe("upstream");
    expect(outcome.message).toContain("AHREFS_API_KEY");
  });

  it("429 は回数制限として扱い、キャッシュに残さない", async () => {
    process.env[KEY] = "test-key";
    let calls = 0;
    const spy = (async () => {
      calls += 1;
      return new Response("", { status: 429 });
    }) as unknown as typeof fetch;
    await fetchAhrefsDr("ahrefs-test-3.example", { fetchImpl: spy });
    const second = await fetchAhrefsDr("ahrefs-test-3.example", { fetchImpl: spy });
    expect(calls).toBe(2);
    expect(second.failure).toBe("rate-limit");
  });
});
