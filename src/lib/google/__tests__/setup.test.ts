/**
 * 「Google 側の設定がまだ」の判定テスト。
 *
 * ここを間違えると、権限不足や通信エラーの人に「Search Console に登録してください」と
 * 出してしまい、原因の違う作業をさせることになる。
 */
import { describe, expect, it } from "vitest";
import { ANALYTICS_SCOPE, SEARCH_CONSOLE_SCOPE } from "../scopes";
import type { SearchConsoleSite } from "../search-console/types";
import { needsGoogleSetup, usableSites } from "../setup";
import type { GoogleStatus } from "../status";

function site(siteUrl: string, permissionLevel: string): SearchConsoleSite {
  return { siteUrl, permissionLevel, isDomainProperty: false, label: siteUrl };
}

function status(patch: Partial<GoogleStatus> = {}): GoogleStatus {
  return {
    connected: true,
    scopes: [SEARCH_CONSOLE_SCOPE, ANALYTICS_SCOPE],
    missingScopes: [],
    settings: {},
    sites: [],
    properties: [],
    errors: {},
    ...patch,
  };
}

describe("選べるサイト", () => {
  it("所有権が未確認のものを外す", () => {
    const sites = [
      site("https://ok.example.com/", "siteOwner"),
      site("https://ng.example.com/", "siteUnverifiedUser"),
    ];
    expect(usableSites(sites).map((s) => s.siteUrl)).toEqual(["https://ok.example.com/"]);
  });

  // 制限付きでも検索パフォーマンスは読める
  it("owner 以外の権限は残す", () => {
    const sites = [
      site("https://a.example.com/", "siteFullUser"),
      site("https://b.example.com/", "siteRestrictedUser"),
    ];
    expect(usableSites(sites)).toHaveLength(2);
  });

  // 権限が読めないだけの相手を隠すと、原因が分からなくなる
  it("permissionLevel が空なら使える側に倒す", () => {
    expect(usableSites([site("https://a.example.com/", "")])).toHaveLength(1);
  });
});

describe("Search Console の設定案内を出すか", () => {
  it("1 件も無ければ出す", () => {
    expect(needsGoogleSetup(status(), "search-console")).toBe(true);
  });

  it("所有権が未確認のものしか無ければ出す", () => {
    const s = status({ sites: [site("https://a.example.com/", "siteUnverifiedUser")] });
    expect(needsGoogleSetup(s, "search-console")).toBe(true);
  });

  it("使えるサイトが 1 件でもあれば出さない", () => {
    const s = status({ sites: [site("https://a.example.com/", "siteOwner")] });
    expect(needsGoogleSetup(s, "search-console")).toBe(false);
  });

  // 原因が違うので、そちらの案内に任せる
  it("権限が足りないときは出さない", () => {
    const s = status({ scopes: [ANALYTICS_SCOPE] });
    expect(needsGoogleSetup(s, "search-console")).toBe(false);
  });

  it("一覧の取得に失敗したときは出さない", () => {
    const s = status({ errors: { searchConsole: "接続できませんでした" } });
    expect(needsGoogleSetup(s, "search-console")).toBe(false);
  });

  it("未接続なら出さない", () => {
    expect(needsGoogleSetup(status({ connected: false }), "search-console")).toBe(false);
  });
});

describe("GA4 の設定案内を出すか", () => {
  it("プロパティが無ければ出す", () => {
    expect(needsGoogleSetup(status(), "analytics")).toBe(true);
  });

  it("1 件でもあれば出さない", () => {
    const s = status({
      properties: [{ propertyId: "1", displayName: "本番", accountName: "自社" }],
    });
    expect(needsGoogleSetup(s, "analytics")).toBe(false);
  });

  it("権限が足りないときは出さない", () => {
    expect(needsGoogleSetup(status({ scopes: [SEARCH_CONSOLE_SCOPE] }), "analytics")).toBe(false);
  });

  it("一覧の取得に失敗したときは出さない", () => {
    const s = status({ errors: { analytics: "接続できませんでした" } });
    expect(needsGoogleSetup(s, "analytics")).toBe(false);
  });

  // Search Console 側の失敗に引きずられない（片方だけ落ちるのは普通に起きる）
  it("Search Console が失敗していても GA4 の判定は独立", () => {
    const s = status({ errors: { searchConsole: "接続できませんでした" } });
    expect(needsGoogleSetup(s, "analytics")).toBe(true);
  });
});
