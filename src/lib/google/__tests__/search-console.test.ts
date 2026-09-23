/**
 * Google サーチコンソール連携（2026-09-23 に再実装）のテスト。
 * 応答の解析・合計の出し方・クライアント・期間・保存値の検証・「登録がまだ」の判定を固定する。
 */
import { describe, expect, it, vi } from "vitest";
import { GoogleLinkError, mapGoogleHttpError } from "../errors";
import { canUse, SEARCH_CONSOLE_SCOPE, BUSINESS_PROFILE_SCOPE } from "../scopes";
import { createSearchConsoleClient } from "../search-console/client";
import { isDomainProperty, parseSearchAnalytics, parseSites, siteLabel, totalsOf } from "../search-console/parse";
import { daysInRange, previousRange, searchConsoleRange } from "../search-console/period";
import { parseSearchConsoleSettings } from "../search-console/settings";
import { apiScopes, needsSearchConsoleSetup, usableSites } from "../search-console/setup";
import type { SearchConsoleSite } from "../search-console/types";

describe("スコープ", () => {
  it("Search Console は webmasters.readonly で使える。口コミ返信の権限とは別", () => {
    expect(canUse([SEARCH_CONSOLE_SCOPE], "search-console")).toBe(true);
    expect(canUse([BUSINESS_PROFILE_SCOPE], "search-console")).toBe(false);
    expect(canUse([SEARCH_CONSOLE_SCOPE], "business-profile")).toBe(false);
  });

  // 権限を足すときに既存の権限（口コミ返信）を一緒に要求するため、API 用のスコープだけを拾う
  it("API 用のスコープだけを残す", () => {
    expect(apiScopes(["openid", "email", "profile", BUSINESS_PROFILE_SCOPE, SEARCH_CONSOLE_SCOPE])).toEqual([BUSINESS_PROFILE_SCOPE, SEARCH_CONSOLE_SCOPE]);
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

describe("期間", () => {
  const today = new Date("2026-09-23T10:00:00Z");

  it("終了日は 3 日前（Search Console のデータ確定の遅れ）", () => {
    expect(searchConsoleRange(28, today)).toEqual({ startDate: "2026-08-24", endDate: "2026-09-20" });
    expect(daysInRange(searchConsoleRange(28, today))).toBe(28);
    expect(searchConsoleRange(7, today)).toEqual({ startDate: "2026-09-14", endDate: "2026-09-20" });
  });

  it("前期間は同じ日数だけ直前", () => {
    expect(previousRange({ startDate: "2026-08-24", endDate: "2026-09-20" })).toEqual({ startDate: "2026-07-27", endDate: "2026-08-23" });
  });

  it("不正な期間はそのまま返す", () => {
    const bad = { startDate: "2026-09-20", endDate: "2026-09-01" };
    expect(previousRange(bad)).toBe(bad);
  });
});

describe("保存値の検証", () => {
  it("選んだサイトだけを読み、関係の無いキー（旧 GA4 の設定）は捨てる", () => {
    expect(parseSearchConsoleSettings({ searchConsoleSiteUrl: "sc-domain:example.com", ga4PropertyId: "123" })).toEqual({ searchConsoleSiteUrl: "sc-domain:example.com" });
  });

  it("壊れていれば未設定として扱う", () => {
    expect(parseSearchConsoleSettings(null)).toEqual({});
    expect(parseSearchConsoleSettings("x")).toEqual({});
    expect(parseSearchConsoleSettings({ searchConsoleSiteUrl: "" })).toEqual({});
    expect(parseSearchConsoleSettings({ searchConsoleSiteUrl: 1 })).toEqual({});
    // 選択を外したあとは null が入っている
    expect(parseSearchConsoleSettings({ searchConsoleSiteUrl: null })).toEqual({});
  });
});

describe("「Google 側の登録がまだ」の判定", () => {
  const site = (siteUrl: string, permissionLevel: string): SearchConsoleSite => ({ siteUrl, permissionLevel, isDomainProperty: false, label: siteUrl });
  const base = { connected: true, hasScope: true, sites: [] as SearchConsoleSite[] };

  it("所有権が未確認のサイトは選ばせない", () => {
    expect(usableSites([site("https://a.example/", "siteOwner"), site("https://b.example/", "siteUnverifiedUser")]).map((s) => s.siteUrl)).toEqual(["https://a.example/"]);
  });

  it("接続・権限があり、選べるサイトが 0 件のときだけ登録手順を出す", () => {
    expect(needsSearchConsoleSetup(base)).toBe(true);
    expect(needsSearchConsoleSetup({ ...base, sites: [site("https://b.example/", "siteUnverifiedUser")] })).toBe(true);
    expect(needsSearchConsoleSetup({ ...base, sites: [site("https://a.example/", "siteOwner")] })).toBe(false);
  });

  // 原因の違う相手に「Search Console に登録してください」と出さない
  it("未接続・権限不足・取得失敗のときは出さない", () => {
    expect(needsSearchConsoleSetup({ ...base, connected: false })).toBe(false);
    expect(needsSearchConsoleSetup({ ...base, hasScope: false })).toBe(false);
    expect(needsSearchConsoleSetup({ ...base, error: "x" })).toBe(false);
  });
});
