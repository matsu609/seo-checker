/**
 * 設定 → geo テーブル（ブランド・キーワード）の同期計画。
 * 何を作り・直し・消すかを純粋関数で固定する（実際の保存は store.ts）。
 */
import { describe, expect, it } from "vitest";
import type { SharedSettings } from "@/lib/settings/shared";
import { EMPTY_PLAN, isEmptyPlan, planGeoSync } from "../sync";
import type { GeoBrand, GeoKeyword } from "../types";

function brand(partial: Partial<GeoBrand> & Pick<GeoBrand, "id" | "type" | "displayName">): GeoBrand {
  return { aliases: [], domains: [], aliasesUpdatedAt: null, createdAt: "", ...partial };
}
function keyword(id: string, text: string): GeoKeyword {
  return { id, text, normalizedHash: "", trackRank: true, trackAio: true, createdAt: "" };
}

const SETTINGS: SharedSettings = {
  lead: { contactName: "山田", company: "サンプル工房", phone: "0", storeType: "その他", address: "", region: "" },
  project: {
    id: "p1",
    name: "サンプル工房",
    domain: "sample-kobo.jp",
    startUrl: "https://sample-kobo.jp/",
    brandAliases: ["Sample Kobo"],
    competitors: [{ id: "c1", name: "ライバル社", domains: ["rival.jp"], brandAliases: [] }],
    createdAt: "",
  },
  keywords: ["世田谷区 歯医者", "歯科 矯正"],
};

describe("planGeoSync", () => {
  it("ホームページが未登録なら何もしない（既存の行も消さない）", () => {
    const plan = planGeoSync({ lead: null, project: null, keywords: ["x"] }, [brand({ id: "b1", type: "own", displayName: "古い" })], [keyword("k1", "古い語")]);
    expect(plan).toEqual(EMPTY_PLAN);
    expect(isEmptyPlan(plan)).toBe(true);
  });

  it("空の geo には自社・競合・キーワードを全部作る", () => {
    const plan = planGeoSync(SETTINGS, [], []);
    expect(plan.create).toEqual([
      { type: "own", spec: { displayName: "サンプル工房", aliases: ["Sample Kobo"], domains: ["sample-kobo.jp"] } },
      { type: "competitor", spec: { displayName: "ライバル社", aliases: [], domains: ["rival.jp"] } },
    ]);
    expect(plan.update).toEqual([]);
    expect(plan.remove).toEqual([]);
    expect(plan.keywordsCreate).toEqual(["世田谷区 歯医者", "歯科 矯正"]);
    expect(plan.keywordsRemove).toEqual([]);
  });

  it("同じ内容なら何もしない（毎回の GET / Cron で無駄な書き込みをしない）", () => {
    const brands = [
      brand({ id: "own", type: "own", displayName: "サンプル工房", aliases: ["Sample Kobo"], domains: ["sample-kobo.jp"] }),
      brand({ id: "c", type: "competitor", displayName: "ライバル社", domains: ["rival.jp"] }),
    ];
    const keywords = [keyword("k1", "世田谷区 歯医者"), keyword("k2", "歯科 矯正")];
    expect(isEmptyPlan(planGeoSync(SETTINGS, brands, keywords))).toBe(true);
  });

  it("違いがあれば直し、設定から消えた競合・キーワードは消し、自社が 2 件あれば 2 件目を消す", () => {
    const brands = [
      brand({ id: "own1", type: "own", displayName: "サンプル工房", aliases: [], domains: ["sample-kobo.jp"] }),
      brand({ id: "own2", type: "own", displayName: "重複" }),
      brand({ id: "c-old", type: "competitor", displayName: "消えた社", domains: ["gone.jp"] }),
      brand({ id: "c-keep", type: "competitor", displayName: "らいばる社", domains: ["old.jp"] }),
    ];
    const settings: SharedSettings = {
      ...SETTINGS,
      project: { ...SETTINGS.project!, competitors: [{ id: "c1", name: "ライバル社", domains: ["rival.jp"], brandAliases: [] }] },
    };
    const plan = planGeoSync(settings, brands, [keyword("k1", "世田谷区 歯医者"), keyword("k9", "捨てる語")]);
    expect(plan.update).toEqual([{ id: "own1", type: "own", spec: { displayName: "サンプル工房", aliases: ["Sample Kobo"], domains: ["sample-kobo.jp"] } }]);
    expect(plan.create).toEqual([{ type: "competitor", spec: { displayName: "ライバル社", aliases: [], domains: ["rival.jp"] } }]);
    expect(plan.remove).toEqual(["own2", "c-old", "c-keep"]);
    expect(plan.keywordsCreate).toEqual(["歯科 矯正"]);
    expect(plan.keywordsRemove).toEqual(["k9"]);
  });

  it("競合は表示名の大文字小文字・前後の空白を無視して突き合わせる", () => {
    const brands = [brand({ id: "c", type: "competitor", displayName: "  rival inc ", domains: ["rival.jp"] }), brand({ id: "own", type: "own", displayName: "サンプル工房", aliases: ["Sample Kobo"], domains: ["sample-kobo.jp"] })];
    const settings: SharedSettings = { ...SETTINGS, project: { ...SETTINGS.project!, competitors: [{ id: "c1", name: "Rival Inc", domains: ["rival.jp"], brandAliases: [] }] }, keywords: [] };
    const plan = planGeoSync(settings, brands, []);
    expect(plan.create).toEqual([]);
    expect(plan.remove).toEqual([]);
    expect(plan.update).toEqual([{ id: "c", type: "competitor", spec: { displayName: "Rival Inc", aliases: [], domains: ["rival.jp"] } }]);
  });
});
