import { describe, expect, it } from "vitest";
import { scanYakki } from "@/lib/writing/yakki";

describe("表記ゆれの検出", () => {
  const cases: [string, string][] = [
    ["満足度は業界Ｎｏ．１です。", "number_one"],
    ["ﾃﾞﾄｯｸｽ効果をうたう。", "detox"],
    ["ｱﾝﾁｴｲｼﾞﾝｸﾞ化粧品です。", "anti_aging"],
    ["続ければ必ず 痩せます。", "kanarazu"],
    ["シミの改善に効果が あります。", "kouka_ari"],
  ];
  for (const [text, id] of cases) {
    it(text, () => {
      expect(scanYakki(text).map((h) => h.entryId)).toContain(id);
    });
  }
  it("正常な表現は拾わない", () => {
    expect(scanYakki("効果的な使い方をご紹介します。")).toEqual([]);
    expect(scanYakki("エイジングケアの習慣。")).toEqual([]);
  });
});
