import { describe, expect, it, vi } from "vitest";
import { listGa4Properties, parseAccountSummaries } from "../analytics-admin";
import { GoogleLinkError, mapGoogleHttpError } from "../errors";
import {
  ANALYTICS_SCOPE,
  canUse,
  hasScope,
  missingScopes,
  SEARCH_CONSOLE_SCOPE,
} from "../scopes";
import { createSearchConsoleClient } from "../search-console/client";
import {
  isDomainProperty,
  parseSearchAnalytics,
  parseSites,
  siteLabel,
  totalsOf,
} from "../search-console/parse";
import { parseLinkSettings } from "../settings";

describe("スコープ", () => {
  it("必要なスコープが揃っていれば足りている", () => {
    expect(missingScopes([SEARCH_CONSOLE_SCOPE, ANALYTICS_SCOPE])).toEqual([]);
    expect(canUse([SEARCH_CONSOLE_SCOPE], "search-console")).toBe(true);
    expect(canUse([SEARCH_CONSOLE_SCOPE], "analytics")).toBe(false);
  });

  // Google は readonly を含まない広いスコープを返すことがある。
  // 「書き込みも可」は「読み取り可」を満たすので、足りない扱いにしない
  it("読み取り専用より広いスコープでも足りているとみなす", () => {
    expect(hasScope(["https://www.googleapis.com/auth/webmasters"], SEARCH_CONSOLE_SCOPE)).toBe(true);
    expect(hasScope(["https://www.googleapis.com/auth/analytics"], ANALYTICS_SCOPE)).toBe(true);
    expect(hasScope(["https://www.googleapis.com/auth/analytics.edit"], ANALYTICS_SCOPE)).toBe(true);
  });

  it("無関係なスコープでは足りない", () => {
    expect(missingScopes(["email", "profile"])).toEqual([SEARCH_CONSOLE_SCOPE, ANALYTICS_SCOPE]);
    expect(missingScopes([])).toHaveLength(2);
  });
});

describe("Search Console の応答解析", () => {
  it("sites.list を解析し、ドメインプロパティを先に並べる", () => {
    const sites = parseSites({
      siteEntry: [
        { siteUrl: "https://b.example.com/", permissionLevel: "siteOwner" },
        { siteUrl: "sc-domain:example.com", permissionLevel: "siteOwner" },
        { siteUrl: "https://a.example.com/", permissionLevel: "siteFullUser" },
      ],
    });
    expect(sites.map((s) => s.siteUrl)).toEqual([
      "sc-domain:example.com",
      "https://a.example.com/",
      "https://b.example.com/",
    ]);
    expect(sites[0].isDomainProperty).toBe(true);
    expect(sites[0].label).toBe("example.com（ドメイン）");
    expect(sites[1].label).toBe("https://a.example.com/");
  });

  it("壊れた応答でも落ちず、使えない行は捨てる", () => {
    expect(parseSites(null)).toEqual([]);
    expect(parseSites({})).toEqual([]);
    expect(parseSites({ siteEntry: "x" })).toEqual([]);
    expect(parseSites({ siteEntry: [null, {}, { siteUrl: "" }] })).toEqual([]);
  });

  it("searchAnalytics.query を解析する", () => {
    const rows = parseSearchAnalytics({
      rows: [
        { keys: ["seo 対策"], clicks: 12, impressions: 340, ctr: 0.0353, position: 8.4 },
        { keys: ["aio"], clicks: "3", impressions: "100", ctr: "0.03", position: "12" },
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ keys: ["seo 対策"], clicks: 12, impressions: 340, ctr: 0.0353, position: 8.4 });
    // 数値が文字列で来ても数にする
    expect(rows[1].clicks).toBe(3);
    expect(rows[1].position).toBe(12);
  });

  it("値が欠けていても 0 で埋める", () => {
    const rows = parseSearchAnalytics({ rows: [{ keys: ["x"] }, {}] });
    expect(rows[0]).toEqual({ keys: ["x"], clicks: 0, impressions: 0, ctr: 0, position: 0 });
    expect(rows[1].keys).toEqual([]);
  });

  it("ドメインプロパティを見分ける", () => {
    expect(isDomainProperty("sc-domain:example.com")).toBe(true);
    expect(isDomainProperty("https://example.com/")).toBe(false);
    expect(siteLabel("sc-domain:example.com")).toBe("example.com（ドメイン）");
  });
});

describe("合計の出し方", () => {
  // 行ごとの CTR や掲載順位を単純平均すると、表示 1 回で 1 位のロングテールが
  // 全体を引き上げてしまう。表示回数で重み付けする
  it("CTR は合計クリック ÷ 合計表示、掲載順位は表示回数で重み付けする", () => {
    const totals = totalsOf([
      { keys: ["a"], clicks: 10, impressions: 1000, ctr: 0.01, position: 20 },
      { keys: ["b"], clicks: 1, impressions: 1, ctr: 1, position: 1 },
    ]);
    expect(totals.clicks).toBe(11);
    expect(totals.impressions).toBe(1001);
    expect(totals.ctr).toBeCloseTo(11 / 1001, 6);
    // 単純平均なら 10.5 になるが、重み付けだと 20 に近づく
    expect(totals.position).toBeCloseTo((20 * 1000 + 1 * 1) / 1001, 6);
  });

  it("表示 0 でもゼロ除算しない", () => {
    expect(totalsOf([])).toEqual({ clicks: 0, impressions: 0, ctr: 0, position: 0 });
  });
});

describe("Search Console クライアント", () => {
  // fetch と同じ引数で受ける。そうしないと mock.calls から URL と body を取り出せない
  const ok = (payload: unknown, status = 200) =>
    vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() =>
      Promise.resolve(new Response(JSON.stringify(payload), { status })),
    );
  const asFetch = (m: ReturnType<typeof ok>) => m as unknown as typeof fetch;

  it("sites を取得する", async () => {
    const fetchImpl = ok({ siteEntry: [{ siteUrl: "https://example.com/", permissionLevel: "siteOwner" }] });
    const client = createSearchConsoleClient({ fetchImpl: asFetch(fetchImpl), getToken: async () => "tok" });
    const sites = await client.listSites();
    expect(sites).toHaveLength(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://searchconsole.googleapis.com/webmasters/v3/sites");
    expect((init?.headers as Record<string, string>).authorization).toBe("Bearer tok");
  });

  // siteUrl は "https://example.com/" や "sc-domain:example.com" で
  // スラッシュとコロンを含む。エンコードしないと別のパスを叩いてしまう
  it("siteUrl を URL エンコードしてパスに入れる", async () => {
    const fetchImpl = ok({ rows: [] });
    const client = createSearchConsoleClient({ fetchImpl: asFetch(fetchImpl), getToken: async () => "tok" });
    await client.query("https://example.com/", { startDate: "2026-08-01", endDate: "2026-08-31" });
    const [url] = fetchImpl.mock.calls[0];
    expect(url).toContain("/sites/https%3A%2F%2Fexample.com%2F/searchAnalytics/query");

    await client.query("sc-domain:example.com", { startDate: "2026-08-01", endDate: "2026-08-31" });
    const [url2] = fetchImpl.mock.calls[1];
    expect(url2).toContain("/sites/sc-domain%3Aexample.com/searchAnalytics/query");
  });

  it("rowLimit を Google の上限内に収める", async () => {
    const fetchImpl = ok({ rows: [] });
    const client = createSearchConsoleClient({ fetchImpl: asFetch(fetchImpl), getToken: async () => "tok" });
    await client.query("https://example.com/", {
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      rowLimit: 999_999,
    });
    const [, init] = fetchImpl.mock.calls[0];
    expect(JSON.parse(String(init?.body)).rowLimit).toBe(25_000);
  });

  it("サイト未選択なら Google を呼ばずに止める", async () => {
    const fetchImpl = ok({});
    const client = createSearchConsoleClient({ fetchImpl: asFetch(fetchImpl), getToken: async () => "tok" });
    await expect(client.query("", { startDate: "2026-08-01", endDate: "2026-08-31" })).rejects.toThrow(
      GoogleLinkError,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("HTTP エラーを日本語のエラーに変える", async () => {
    for (const [status, code] of [
      [401, "not_connected"],
      [403, "forbidden"],
      [429, "rate_limited"],
      [500, "network"],
    ] as const) {
      const fetchImpl = ok({}, status);
      const client = createSearchConsoleClient({ fetchImpl: asFetch(fetchImpl), getToken: async () => "tok" });
      await expect(client.listSites()).rejects.toMatchObject({ code });
    }
    expect(mapGoogleHttpError(403, "x").code).toBe("forbidden");
  });
});

describe("GA4 プロパティ一覧", () => {
  it("accountSummaries から数字のプロパティ ID を取り出す", () => {
    const props = parseAccountSummaries({
      accountSummaries: [
        {
          displayName: "B 社",
          propertySummaries: [{ property: "properties/222", displayName: "本番" }],
        },
        {
          displayName: "A 社",
          propertySummaries: [
            { property: "properties/111", displayName: "サイト" },
            { property: "properties/bad", displayName: "壊れている" },
            null,
          ],
        },
      ],
    });
    // アカウント名 → プロパティ名の順に並ぶ
    expect(props.map((p) => p.propertyId)).toEqual(["111", "222"]);
    expect(props[0]).toEqual({ propertyId: "111", displayName: "サイト", accountName: "A 社" });
  });

  it("壊れた応答でも落ちない", () => {
    expect(parseAccountSummaries(null)).toEqual([]);
    expect(parseAccountSummaries({ accountSummaries: "x" })).toEqual([]);
  });

  it("一覧を取得する", async () => {
    const fetchImpl = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() =>
      Promise.resolve(new Response(JSON.stringify({ accountSummaries: [] }), { status: 200 })),
    );
    await expect(
      listGa4Properties({ fetchImpl: fetchImpl as unknown as typeof fetch, getToken: async () => "tok" }),
    ).resolves.toEqual([]);
    const [url] = fetchImpl.mock.calls[0];
    expect(url).toContain("/accountSummaries");
  });
});

describe("連携設定の検証", () => {
  it("正しい値だけ受け取る", () => {
    expect(parseLinkSettings({ searchConsoleSiteUrl: "sc-domain:example.com", ga4PropertyId: "123" })).toEqual({
      searchConsoleSiteUrl: "sc-domain:example.com",
      ga4PropertyId: "123",
    });
    expect(parseLinkSettings({})).toEqual({});
  });

  // Clerk のメタデータは外部から返る任意の JSON。壊れていれば未設定に倒す
  it("壊れた値は未設定として扱う", () => {
    expect(parseLinkSettings(null)).toEqual({});
    expect(parseLinkSettings("x")).toEqual({});
    expect(parseLinkSettings({ ga4PropertyId: "properties/123" })).toEqual({});
    expect(parseLinkSettings({ ga4PropertyId: 123 })).toEqual({});
    expect(parseLinkSettings({ searchConsoleSiteUrl: "" })).toEqual({});
  });
});
