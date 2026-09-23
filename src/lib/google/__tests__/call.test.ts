/**
 * Google API の共通の呼び出し（call.ts。2026-09-23 に 3 つの実装をまとめた）。
 * 寄せる前と画面に出る文言が変わらないこと・トークンを何度も取りに行かないことを確かめる。
 */
import { describe, expect, it, vi } from "vitest";
import { findLocationByPlaceId, listAllLocations, listReviews } from "../business-profile";
import { callGoogleApi, httpErrorMapper, withResolvedToken } from "../call";
import { fetchPerformanceSummary } from "../performance";
import { BUSINESS_PROFILE_SCOPE, scopesToRequest, SEARCH_CONSOLE_SCOPE } from "../scopes";
import { createSearchConsoleClient } from "../search-console/client";

const timeout = (async () => {
  throw new DOMException("timeout", "TimeoutError");
}) as unknown as typeof fetch;
const offline = (async () => {
  throw new TypeError("fetch failed");
}) as unknown as typeof fetch;
const broken = (async () => new Response("{壊れた", { status: 200 })) as unknown as typeof fetch;
const getToken = async () => "tok";

describe("エラーの文言（寄せる前と同じ）", () => {
  it("Business Profile: 主語と助詞の間に空白を入れない", async () => {
    await expect(listReviews("accounts/1/locations/2", null, { fetchImpl: timeout, getToken })).rejects.toMatchObject({
      code: "network",
      message: "Google ビジネス プロフィールの応答がありませんでした（タイムアウト）",
    });
    await expect(listReviews("accounts/1/locations/2", null, { fetchImpl: offline, getToken })).rejects.toMatchObject({ message: "Google ビジネス プロフィールに接続できませんでした" });
    await expect(listReviews("accounts/1/locations/2", null, { fetchImpl: broken, getToken })).rejects.toMatchObject({ message: "Google ビジネス プロフィールの応答を解釈できませんでした" });
    const notFound = (async () => new Response("{}", { status: 404 })) as unknown as typeof fetch;
    await expect(listReviews("accounts/1/locations/2", null, { fetchImpl: notFound, getToken })).rejects.toMatchObject({
      code: "forbidden",
      message: "Google ビジネス プロフィールに該当するビジネスや口コミが見つかりませんでした。",
    });
  });

  it("Search Console: 英字の主語のあとは空白を入れる", async () => {
    await expect(createSearchConsoleClient({ fetchImpl: timeout, getToken }).listSites()).rejects.toMatchObject({ message: "Search Console の応答がありませんでした（タイムアウト）" });
    await expect(createSearchConsoleClient({ fetchImpl: offline, getToken }).listSites()).rejects.toMatchObject({ message: "Search Console に接続できませんでした" });
    const forbidden = (async () => new Response("{}", { status: 403 })) as unknown as typeof fetch;
    await expect(createSearchConsoleClient({ fetchImpl: forbidden, getToken }).listSites()).rejects.toMatchObject({
      message: "Search Console へのアクセスが拒否されました。そのアカウントに閲覧権限があるかご確認ください。",
    });
  });

  it("インサイト: 404 はビジネスが見つからない案内", async () => {
    const notFound = (async () => new Response("{}", { status: 404 })) as unknown as typeof fetch;
    await expect(fetchPerformanceSummary("locations/1", "2026-08", { fetchImpl: notFound, getToken, now: new Date("2026-09-17T00:00:00Z") })).rejects.toMatchObject({
      message: "Google ビジネス プロフィールのインサイトに該当するビジネスが見つかりませんでした。",
    });
  });

  it("差し替えない status は共通の変換（429 = 上限）", () => {
    const map = httpErrorMapper("X", { forbidden: "403 の案内" });
    expect(map(403)).toMatchObject({ code: "forbidden", message: "403 の案内" });
    expect(map(404).code).toBe("network");
    expect(map(429).code).toBe("rate_limited");
  });

  it("204 は空のオブジェクト", async () => {
    const noContent = (async () => new Response(null, { status: 204 })) as unknown as typeof fetch;
    await expect(callGoogleApi("https://x", { method: "DELETE" }, { label: "X", service: "business-profile", timeoutMs: 1000 }, { fetchImpl: noContent, getToken })).resolves.toEqual({});
  });
});

describe("トークンは 1 回の処理で 1 回だけ取る", () => {
  it("ビジネス一覧（アカウント 2 つ）でも 1 回", async () => {
    const tokens = vi.fn(async () => "tok");
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes("/accounts?")) return Response.json({ accounts: [{ name: "accounts/1" }, { name: "accounts/2" }] });
      const account = url.includes("/accounts/1/") ? "1" : "2";
      return Response.json({ locations: [{ name: `locations/${account}0`, title: `店 ${account}`, metadata: { placeId: `ChIJ${account}` } }] });
    }) as unknown as typeof fetch;
    const all = await listAllLocations({ fetchImpl, getToken: tokens });
    expect(all).toHaveLength(2);
    expect(tokens).toHaveBeenCalledTimes(1);
    await expect(findLocationByPlaceId("ChIJ2", { fetchImpl, getToken: tokens })).resolves.toMatchObject({ name: "accounts/2/locations/20" });
    await expect(findLocationByPlaceId("ChIJ9", { fetchImpl, getToken: tokens })).resolves.toBeNull();
  });

  it("サーチコンソールのクライアントは並行の呼び出しでも 1 回", async () => {
    const tokens = vi.fn(async () => "tok");
    const fetchImpl = vi.fn(async () => Response.json({ rows: [] })) as unknown as typeof fetch;
    const client = createSearchConsoleClient({ fetchImpl, getToken: tokens });
    await Promise.all([1, 2, 3].map(() => client.query("sc-domain:example.com", { startDate: "2026-08-01", endDate: "2026-08-31" })));
    expect(tokens).toHaveBeenCalledTimes(1);
  });

  it("取得に失敗したら、以後も同じ理由で失敗する（聞き直さない）", async () => {
    const tokens = vi.fn(async () => {
      throw new Error("未接続");
    });
    const opts = withResolvedToken({ getToken: tokens }, "business-profile");
    await expect(opts.getToken!()).rejects.toThrow("未接続");
    await expect(opts.getToken!()).rejects.toThrow("未接続");
    expect(tokens).toHaveBeenCalledTimes(1);
  });
});

describe("権限を足すときに要求するスコープ（2026-09-23）", () => {
  it("すでに許可されている API のスコープも一緒に要求する（口コミ返信の接続で、サーチコンソールの権限を落とさない）", () => {
    expect(scopesToRequest(BUSINESS_PROFILE_SCOPE, ["openid", "email", SEARCH_CONSOLE_SCOPE])).toEqual([SEARCH_CONSOLE_SCOPE, BUSINESS_PROFILE_SCOPE]);
    // ブラウザ側の approvedScopes（空白区切り）だけでも拾う
    expect(scopesToRequest(BUSINESS_PROFILE_SCOPE, [], `openid ${SEARCH_CONSOLE_SCOPE} email`)).toEqual([SEARCH_CONSOLE_SCOPE, BUSINESS_PROFILE_SCOPE]);
    // 重複しない
    expect(scopesToRequest(SEARCH_CONSOLE_SCOPE, [SEARCH_CONSOLE_SCOPE, BUSINESS_PROFILE_SCOPE], BUSINESS_PROFILE_SCOPE)).toEqual([SEARCH_CONSOLE_SCOPE, BUSINESS_PROFILE_SCOPE]);
    expect(scopesToRequest(BUSINESS_PROFILE_SCOPE)).toEqual([BUSINESS_PROFILE_SCOPE]);
  });
});
