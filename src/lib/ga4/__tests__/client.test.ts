import { generateKeyPairSync } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { clearTokenCache, TOKEN_ENDPOINT } from "../auth";
import {
  GA4_DATA_ENDPOINT,
  createGa4Client,
  dimensionValue,
  headerIndex,
  mapGa4HttpError,
  metricNumber,
  normalizePropertyId,
  parseRunReport,
} from "../client";
import { Ga4Error, type ServiceAccount } from "../types";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });

const ACCOUNT: ServiceAccount = {
  clientEmail: "reporter@example.iam.gserviceaccount.com",
  privateKey: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
  tokenUri: TOKEN_ENDPOINT,
};

/** /token には常に成功、runReport は与えた応答を返す fetch */
function stubFetch(report: { status: number; body: unknown }) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (u === TOKEN_ENDPOINT) {
      return new Response(JSON.stringify({ access_token: "ya29.token", expires_in: 3600 }), { status: 200 });
    }
    return new Response(JSON.stringify(report.body), { status: report.status });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe("parseRunReport", () => {
  it("正常な応答を読む", () => {
    const parsed = parseRunReport({
      dimensionHeaders: [{ name: "date" }, { name: "sessionSource" }],
      metricHeaders: [{ name: "sessions" }],
      rows: [
        { dimensionValues: [{ value: "20260901" }, { value: "chatgpt.com" }], metricValues: [{ value: "12" }] },
      ],
      rowCount: 1,
    });
    expect(parsed.dimensionHeaders).toEqual(["date", "sessionSource"]);
    expect(parsed.metricHeaders).toEqual(["sessions"]);
    expect(parsed.rows).toEqual([{ dimensionValues: ["20260901", "chatgpt.com"], metricValues: ["12"] }]);
    expect(parsed.rowCount).toBe(1);
  });

  it("rows / metricValues / dimensionValues が欠けていても落ちない", () => {
    expect(parseRunReport({}).rows).toEqual([]);
    expect(parseRunReport(null).rows).toEqual([]);
    expect(parseRunReport(undefined).rowCount).toBe(0);
    expect(parseRunReport({ rows: "nope" }).rows).toEqual([]);
    expect(parseRunReport({ rows: [null, 3, { dimensionValues: [{ value: "a" }] }] }).rows).toEqual([
      { dimensionValues: ["a"], metricValues: [] },
    ]);
    expect(parseRunReport({ rows: [{ metricValues: [{}, { value: "5" }] }] }).rows[0].metricValues).toEqual(["", "5"]);
  });

  it("rowCount が無ければ行数を使う", () => {
    const parsed = parseRunReport({ rows: [{ metricValues: [{ value: "1" }] }, { metricValues: [{ value: "2" }] }] });
    expect(parsed.rowCount).toBe(2);
  });
});

describe("metricNumber / dimensionValue / headerIndex", () => {
  const row = { dimensionValues: ["20260901", "chatgpt.com"], metricValues: ["12", "", "abc", "3.5"] };

  it("欠損・非数値は 0 にする", () => {
    expect(metricNumber(row, 0)).toBe(12);
    expect(metricNumber(row, 1)).toBe(0);
    expect(metricNumber(row, 2)).toBe(0);
    expect(metricNumber(row, 3)).toBe(3.5);
    expect(metricNumber(row, 9)).toBe(0);
    expect(metricNumber(undefined, 0)).toBe(0);
  });

  it("ディメンションの欠損は空文字", () => {
    expect(dimensionValue(row, 1)).toBe("chatgpt.com");
    expect(dimensionValue(row, 5)).toBe("");
    expect(dimensionValue(undefined, 0)).toBe("");
  });

  it("ヘッダー名から列位置を引ける", () => {
    expect(headerIndex(["sessions", "totalUsers"], "totalUsers")).toBe(1);
    expect(headerIndex(["sessions"], "keyEvents")).toBe(-1);
  });
});

describe("mapGa4HttpError", () => {
  it("401 / 403 は権限不足", () => {
    for (const status of [401, 403]) {
      const err = mapGa4HttpError(status);
      expect(err.message).toBe("サービスアカウントに GA4 プロパティの閲覧権限がありません");
      expect(err.code).toBe("auth");
      expect(err.status).toBe(502);
    }
  });

  it("404 はプロパティ ID", () => {
    const err = mapGa4HttpError(404);
    expect(err.message).toBe("プロパティ ID が見つかりません");
    expect(err.code).toBe("not_found");
  });

  it("429 は上限", () => {
    const err = mapGa4HttpError(429);
    expect(err.message).toBe("API の上限に達しました");
    expect(err.status).toBe(429);
  });

  it("その他は 502 相当（upstream）", () => {
    const err = mapGa4HttpError(500, "internal");
    expect(err.code).toBe("upstream");
    expect(err.status).toBe(502);
    expect(err.message).toContain("HTTP 500");
    expect(err.message).toContain("internal");
  });
});

describe("normalizePropertyId", () => {
  it("properties/ 接頭辞と空白を落とす", () => {
    expect(normalizePropertyId(" 123456789 ")).toBe("123456789");
    expect(normalizePropertyId("properties/123456789")).toBe("123456789");
  });
});

describe("createGa4Client().runReport", () => {
  beforeEach(() => clearTokenCache());

  it("トークンを付けて :runReport に POST する", async () => {
    const { fetchImpl, calls } = stubFetch({
      status: 200,
      body: { metricHeaders: [{ name: "sessions" }], rows: [{ metricValues: [{ value: "7" }] }] },
    });
    const client = createGa4Client("properties/999", ACCOUNT, { fetchImpl });
    const report = await client.runReport({
      dateRanges: [{ startDate: "2026-08-01", endDate: "2026-08-31" }],
      metrics: [{ name: "sessions" }],
    });
    expect(report.rows).toHaveLength(1);
    expect(metricNumber(report.rows[0], 0)).toBe(7);

    const call = calls.find((c) => c.url !== TOKEN_ENDPOINT);
    expect(call?.url).toBe(`${GA4_DATA_ENDPOINT}/properties/999:runReport`);
    const headers = call?.init?.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer ya29.token");
    expect(JSON.parse(String(call?.init?.body))).toMatchObject({
      dateRanges: [{ startDate: "2026-08-01", endDate: "2026-08-31" }],
    });
  });

  it("403 は日本語の権限エラーになる", async () => {
    const { fetchImpl } = stubFetch({ status: 403, body: { error: { message: "denied" } } });
    const client = createGa4Client("999", ACCOUNT, { fetchImpl });
    await expect(client.runReport({ dateRanges: [{ startDate: "a", endDate: "b" }] })).rejects.toThrow(
      "サービスアカウントに GA4 プロパティの閲覧権限がありません",
    );
  });

  it("プロパティ ID が空なら config エラー", async () => {
    const { fetchImpl } = stubFetch({ status: 200, body: {} });
    const client = createGa4Client("  ", ACCOUNT, { fetchImpl });
    await expect(client.runReport({ dateRanges: [{ startDate: "a", endDate: "b" }] })).rejects.toMatchObject({
      code: "config",
    });
  });

  it("接続できなければ upstream エラー", async () => {
    const fetchImpl = (async (url: string | URL) => {
      if (String(url) === TOKEN_ENDPOINT) {
        return new Response(JSON.stringify({ access_token: "t", expires_in: 3600 }), { status: 200 });
      }
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const client = createGa4Client("999", ACCOUNT, { fetchImpl });
    await expect(client.runReport({ dateRanges: [{ startDate: "a", endDate: "b" }] })).rejects.toBeInstanceOf(Ga4Error);
  });
});
