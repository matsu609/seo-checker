/**
 * 設定に集約した基本情報の読み取り（純粋関数）。
 * ブラウザのストア（またはサーバーの user_stores）と登録情報から、各ツールが同じ形で読めることを固定する。
 */
import { describe, expect, it } from "vitest";
import { businessName, competitorBrandsOf, keywordsForProject, ownBrandOf, sharedSettingsFromStores } from "../shared";

const LEAD = { contactName: "山田", company: "サンプル工房", phone: "03-0000-0000", storeType: "その他" as const, address: "東京都", region: "世田谷区" };

const PROJECTS = [
  {
    id: "p1",
    name: "サンプル工房のサイト",
    domain: "sample-kobo.jp",
    startUrl: "https://sample-kobo.jp/",
    brandAliases: ["サンプルコウボウ", "Sample Kobo"],
    competitors: [
      { id: "c1", name: "ライバル社", domains: ["rival.jp", "www.rival.jp"], brandAliases: ["Rival"] },
      { id: "c2", name: "  ", domains: ["nameless.example"], brandAliases: [] },
      { id: "c3", name: "", domains: [], brandAliases: [] },
    ],
    createdAt: "2026-09-19T00:00:00.000Z",
  },
  { id: "p2", name: "別サイト", domain: "other.jp", startUrl: "https://other.jp/", brandAliases: [], competitors: [], createdAt: "2026-09-19T00:00:00.000Z" },
];

const KEYWORDS = [
  { id: "k1", projectId: "p1", keyword: "世田谷区 歯医者", device: "desktop", createdAt: "" },
  { id: "k2", projectId: "p1", keyword: "世田谷区 歯医者", device: "mobile", createdAt: "" },
  { id: "k3", projectId: "p2", keyword: "別サイトの語", device: "desktop", createdAt: "" },
  { id: "k4", projectId: "p1", keyword: "  歯科 矯正  ", device: "desktop", createdAt: "" },
];

describe("sharedSettingsFromStores", () => {
  it("現在のホームページと、そのキーワード（重複なし・前後の空白なし）を返す", () => {
    const s = sharedSettingsFromStores({ projects: PROJECTS, currentProjectId: "p1", rankKeywords: KEYWORDS }, LEAD);
    expect(s.project?.id).toBe("p1");
    expect(s.keywords).toEqual(["世田谷区 歯医者", "歯科 矯正"]);
    expect(s.lead).toEqual(LEAD);
  });

  it("currentProjectId が無ければ先頭、ストアが壊れていれば空", () => {
    expect(sharedSettingsFromStores({ projects: PROJECTS }, null).project?.id).toBe("p1");
    expect(sharedSettingsFromStores({ projects: "broken" }, null)).toEqual({ lead: null, project: null, keywords: [] });
    expect(sharedSettingsFromStores({}, null).project).toBeNull();
  });

  it("キーワードは選んでいるホームページのぶんだけ", () => {
    expect(keywordsForProject(KEYWORDS, "p2")).toEqual(["別サイトの語"]);
    expect(keywordsForProject(null, "p1")).toEqual([]);
  });
});

describe("ブランドの導出", () => {
  it("自社: サイト名を表示名、会社名が違えば別名に足し、ドメインは 1 つ", () => {
    const s = sharedSettingsFromStores({ projects: PROJECTS, currentProjectId: "p1" }, LEAD);
    expect(businessName(s)).toBe("サンプル工房のサイト");
    expect(ownBrandOf(s)).toEqual({
      displayName: "サンプル工房のサイト",
      aliases: ["サンプルコウボウ", "Sample Kobo", "サンプル工房"],
      domains: ["sample-kobo.jp"],
    });
  });

  it("自社: サイト名が無ければ会社名、それも無ければドメイン。ホームページが無ければ null", () => {
    const noName = [{ ...PROJECTS[1], name: "" }];
    expect(ownBrandOf(sharedSettingsFromStores({ projects: noName }, LEAD))?.displayName).toBe("サンプル工房");
    expect(ownBrandOf(sharedSettingsFromStores({ projects: noName }, null))?.displayName).toBe("other.jp");
    expect(ownBrandOf(sharedSettingsFromStores({}, LEAD))).toBeNull();
  });

  it("競合: 名前が空ならドメインを名前に、ドメインも無ければ捨てる。www. は正規化済みなので重複だけ除く", () => {
    const s = sharedSettingsFromStores({ projects: PROJECTS, currentProjectId: "p1" }, LEAD);
    expect(competitorBrandsOf(s)).toEqual([
      { displayName: "ライバル社", aliases: ["Rival"], domains: ["rival.jp", "www.rival.jp"] },
      { displayName: "nameless.example", aliases: [], domains: ["nameless.example"] },
    ]);
  });
});
