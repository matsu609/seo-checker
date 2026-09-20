import { describe, expect, it } from "vitest";
import { emptyProfile, type ListingStates } from "../profile";
import { addressFound, applyCheck, buildListingAlert, checkNapInText, htmlToText, mediaToCheck, phoneDigits } from "../recheck";

const profile = { ...emptyProfile(), name: "サロン ウルフ", phone: "03-1234-5678", address: "東京都渋谷区神南1-2-3 ビル4F" };

describe("掲載ページの確認", () => {
  it("店名・電話・住所がそろえば ok（全角・ハイフンの違いは無視）", () => {
    const text = "サロン　ウルフ　ＴＥＬ：０３（１２３４）５６７８　東京都渋谷区神南１丁目２－３ ビル４Ｆ";
    const r = checkNapInText(text, profile);
    expect(r.result).toBe("ok");
    expect(r.found).toEqual({ name: true, phone: true, address: false });
  });

  it("店名が無ければ missing、店名だけなら mismatch", () => {
    expect(checkNapInText("別の店 03-9999-0000", profile).result).toBe("missing");
    expect(checkNapInText("サロン ウルフ 03-9999-0000 大阪府", profile).result).toBe("mismatch");
  });

  it("住所は先頭からの一部でも見つかったとする。電話は +81 も同じ", () => {
    expect(addressFound("東京都渋谷区神南1-2-3", "〒150-0041 東京都渋谷区神南1-2-3 ビル4F")).toBe(true);
    expect(addressFound("東京都新宿区", "東京都渋谷区神南1-2-3")).toBe(false);
    expect(phoneDigits("+81 3-1234-5678")).toBe("0312345678");
  });

  it("HTML からスクリプトを除いて本文にする", () => {
    expect(htmlToText("<html><head><script>x=1</script></head><body><p>サロン</p><style>a{}</style></body></html>").trim()).toBe("サロン");
  });

  it("確認する媒体は掲載済み + URL あり + 期限切れ。結果は状況に書き込む", () => {
    const now = new Date("2026-10-02T00:00:00Z");
    const states: ListingStates = {
      A: { status: "live", url: "https://a.jp/x", note: "", updatedAt: null, lastCheckedAt: null, nextCheckAt: null, check: null },
      B: { status: "live", url: "https://b.jp/x", note: "", updatedAt: null, lastCheckedAt: "2026-09-20T00:00:00Z", nextCheckAt: "2026-10-20T00:00:00Z", check: null },
      C: { status: "live", url: "", note: "", updatedAt: null, lastCheckedAt: null, nextCheckAt: null, check: null },
      D: { status: "todo", url: "https://d.jp/x", note: "", updatedAt: null, lastCheckedAt: null, nextCheckAt: null, check: null },
    };
    expect(mediaToCheck(states, now)).toEqual(["A"]);
    expect(mediaToCheck(states, now, true)).toEqual(["A", "B"]);
    const next = applyCheck(states.A, { result: "ok", detail: "d", found: { name: true, phone: true, address: false } }, now);
    expect(next.status).toBe("live");
    expect(next.lastCheckedAt).toBe(now.toISOString());
    expect(next.nextCheckAt).toBe("2026-11-01T00:00:00.000Z");
    expect(next.check?.result).toBe("ok");
  });

  it("知らせは消えた・ずれた分だけ", () => {
    const ok = { mediaId: "A", mediaName: "Yelp", url: "https://a", outcome: { result: "ok" as const, detail: "", found: { name: true, phone: true, address: true } } };
    const missing = { mediaId: "B", mediaName: "Hotfrog", url: "https://b", outcome: { result: "missing" as const, detail: "店名が無い", found: { name: false, phone: false, address: false } } };
    expect(buildListingAlert("店", [ok])).toBeNull();
    const alert = buildListingAlert("店", [ok, missing]);
    expect(alert?.title).toBe("店 の掲載が 1 媒体で見つかりません");
    expect(alert?.body).toContain("・Hotfrog: 掲載が見つからない（店名が無い）https://b");
  });
});
