import { describe, expect, it } from "vitest";
import { emptyProfile, type ListingStates } from "../profile";
import { addressFound, applyCheck, buildListingAlert, checkNapInText, htmlToText, mediaToCheck, nextCheckAt, phoneDigits } from "../recheck";

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
    // 次の定期実行（毎月 2 日 5:00 JST = 前日 20:00 UTC）のうち 20 日以上先のもの = 11/2
    expect(next.nextCheckAt).toBe("2026-11-01T20:00:00.000Z");
    expect(next.check?.result).toBe("ok");
  });

  it("定期実行（毎月 2 日）で確かめた媒体は、どの月でも翌月 2 日の実行で必ず期限が来る", () => {
    const live = (next: string | null) => ({ status: "live" as const, url: "https://a.jp/x", note: "", updatedAt: null, lastCheckedAt: null, nextCheckAt: next, check: null });
    for (let month = 1; month <= 12; month++) {
      // 5:00 JST の Cron が数秒〜数十分遅れて動いた想定
      const run = new Date(Date.UTC(2026, month - 1, 1, 20, 0, 37));
      const nextRun = new Date(Date.UTC(2026, month, 1, 20, 0, 5));
      expect(mediaToCheck({ A: live(nextCheckAt(run)) }, nextRun), `${month} 月`).toEqual(["A"]);
    }
  });

  it("以前の「30 日後」で保存された期限も、翌月 2 日の実行で拾う（2 月 → 3 月）", () => {
    const legacy = new Date(Date.UTC(2027, 1, 1, 20, 0, 37) + 30 * 86_400_000).toISOString(); // 3/3 前後
    const march2 = new Date(Date.UTC(2027, 2, 1, 20, 0, 5));
    expect(mediaToCheck({ A: { status: "live", url: "https://a.jp/x", note: "", updatedAt: null, lastCheckedAt: null, nextCheckAt: legacy, check: null } }, march2)).toEqual(["A"]);
  });

  it("手動で確かめた直後の定期実行は飛ばす（20 日以上あける）", () => {
    // 9/25 に手動 → 10/2 は近すぎるので 11/2
    expect(nextCheckAt(new Date("2026-09-25T03:00:00Z"))).toBe("2026-11-01T20:00:00.000Z");
    // 9/10 に手動 → 10/2
    expect(nextCheckAt(new Date("2026-09-10T03:00:00Z"))).toBe("2026-10-01T20:00:00.000Z");
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
