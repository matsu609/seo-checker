import { afterEach, describe, expect, it } from "vitest";
import { fetchOpenPageRank, isOpenPageRankEnabled, parseOpr } from "../openpagerank";

const KEY = "OPENPAGERANK_API_KEY";
const original = process.env[KEY];

afterEach(() => {
  if (original === undefined) delete process.env[KEY];
  else process.env[KEY] = original;
});

describe("Open PageRank の読み取り", () => {
  it("見つかったドメインだけ数値にする", () => {
    const entries = parseOpr({
      response: [
        { status_code: 200, domain: "Example.com", page_rank_decimal: 5.23, rank: "1234" },
        { status_code: 404, error: "Domain not found", domain: "missing.example", page_rank_decimal: 0, rank: null },
      ],
    });
    expect(entries).toEqual([
      { domain: "example.com", rank: 5.23, worldRank: 1234 },
      { domain: "missing.example", rank: null, worldRank: null },
    ]);
  });

  it("形が違う応答では空配列", () => {
    expect(parseOpr(null)).toEqual([]);
    expect(parseOpr({ response: "x" })).toEqual([]);
  });
});

describe("Open PageRank の取得", () => {
  it("キーが無ければ呼ばずに no-key", async () => {
    delete process.env[KEY];
    expect(isOpenPageRankEnabled()).toBe(false);
    const outcome = await fetchOpenPageRank(["example.com"], {
      fetchImpl: (() => {
        throw new Error("呼んではいけない");
      }) as unknown as typeof fetch,
    });
    expect(outcome.failure).toBe("no-key");
    expect(outcome.entries).toEqual([]);
  });

  it("複数ドメインを 1 回のリクエストにまとめ、キーはヘッダーで送る", async () => {
    process.env[KEY] = "test-key";
    let url = "";
    let headers: Record<string, string> = {};
    const spy = (async (u: string, init: RequestInit) => {
      url = u;
      headers = init.headers as Record<string, string>;
      return new Response(JSON.stringify({ response: [{ status_code: 200, domain: "opr-a.example", page_rank_decimal: 3.1, rank: 900 }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const outcome = await fetchOpenPageRank(["opr-a.example", "opr-b.example"], { fetchImpl: spy });
    expect(url).toContain("domains[]=opr-a.example");
    expect(url).toContain("domains[]=opr-b.example");
    expect(headers["API-OPR"]).toBe("test-key");
    expect(outcome.entries[0]).toEqual({ domain: "opr-a.example", rank: 3.1, worldRank: 900 });
  });

  it("エラーでも例外にせず、取れた分を返す", async () => {
    process.env[KEY] = "test-key";
    const outcome = await fetchOpenPageRank(["opr-c.example"], {
      fetchImpl: (async () => new Response("", { status: 429 })) as unknown as typeof fetch,
    });
    expect(outcome.failure).toBe("upstream");
    expect(outcome.message).toContain("429");
  });

  it("問い合わせ先が無ければ何もしない", async () => {
    process.env[KEY] = "test-key";
    const outcome = await fetchOpenPageRank(["not a domain"], {
      fetchImpl: (() => {
        throw new Error("呼んではいけない");
      }) as unknown as typeof fetch,
    });
    expect(outcome.entries).toEqual([]);
    expect(outcome.failure).toBeNull();
  });
});
