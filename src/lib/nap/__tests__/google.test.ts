import { describe, expect, it } from "vitest";
import { checkGoogleDetail, checkGoogleMaps, sameBusiness, type GoogleLookup } from "../google";
import type { NapInput } from "../types";

const input: NapInput = { name: "株式会社ウルフ情報", address: "東京都渋谷区神南1-2-3 ウルフビル4F", phone: "03-1234-5678", website: "https://example.co.jp/" };
const detail = { id: "p1", name: "ウルフ情報", address: "日本、〒150-0041 東京都渋谷区神南１丁目２−３ ウルフビル4F", phone: "03-1234-5678", website: "https://www.example.co.jp/", mapsUrl: "https://maps.google.com/?cid=1" };

function lookup(over: Partial<GoogleLookup>): GoogleLookup {
  return { saved: async () => [], search: async () => [], detail: async () => detail, configured: () => true, ...over };
}

describe("Google マップの確認", () => {
  it("同じ店かどうか（法人格・空白は無視、片方が他方を含めば同じ）", () => {
    expect(sameBusiness("株式会社ウルフ情報", "ウルフ情報")).toBe(true);
    expect(sameBusiness("ウルフ情報", "ウルフ情報 渋谷店")).toBe(true);
    expect(sameBusiness("ウルフ情報", "別の店")).toBe(false);
    expect(sameBusiness("", "x")).toBe(false);
  });

  it("詳細を 4 項目で突き合わせる（Google の住所表記は 日本、〒 付き・全角）", () => {
    const s = checkGoogleDetail(input, detail);
    expect(s.kind).toBe("google_maps");
    expect(s.url).toBe("https://maps.google.com/?cid=1");
    expect(s.fields.map((f) => [f.field, f.status])).toEqual([
      ["name", "mismatch"],
      ["address", "match"],
      ["phone", "match"],
      ["website", "match"],
    ]);
  });

  it("保存済みの報告書に同じ店があれば API を呼ばない", async () => {
    let searched = false;
    const r = await checkGoogleMaps(input, "u1", lookup({ saved: async () => [detail], search: async () => ((searched = true), []) }));
    expect(r.source?.label).toBe("Google マップ（ウルフ情報）");
    expect(r.note).toBeNull();
    expect(searched).toBe(false);
  });

  it("キーが無ければ確認しない（理由を返す）", async () => {
    const r = await checkGoogleMaps(input, "u1", lookup({ configured: () => false }));
    expect(r.source).toBeNull();
    expect(r.note).toMatch(/GOOGLE_PLACES_API_KEY/);
  });

  it("検索で同じ店が見つかれば詳細を取る。見つからなければエラーの媒体として返す", async () => {
    const hit = await checkGoogleMaps(input, "u1", lookup({ search: async () => [{ id: "p1", name: "ウルフ情報", address: null }] }));
    expect(hit.source?.error).toBeNull();
    expect(hit.source?.fields).toHaveLength(4);
    const miss = await checkGoogleMaps(input, "u1", lookup({ search: async () => [{ id: "p2", name: "別の店", address: null }] }));
    expect(miss.source?.error).toMatch(/見つかりませんでした（見つかったのは: 別の店）/);
    const fail = await checkGoogleMaps(input, "u1", lookup({ search: async () => { throw new Error("boom"); } }));
    expect(fail.source?.error).toBe("Google マップの確認中にエラーが発生しました");
  });
});
