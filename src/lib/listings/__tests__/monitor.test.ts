/**
 * 掲載の生存監視。
 *
 * いちばん大事な決まりは「**確実でないことを『消えた』と言わない**」こと。
 * JavaScript で描かれた媒体のページはこちらのクローラから中身が読めないので、
 * 店名が見つからないだけで gone にしてはいけない（お客様に嘘の警告を出すことになる）。
 */
import { describe, expect, it } from "vitest";
import { ListingProfileSchema, ListingStateSchema, type ListingStates } from "../profile";
import { searchableText } from "../check";
import {
  applyCheck,
  CHECK_INTERVAL_DAYS,
  digitsOf,
  dueMediaIds,
  isCheckable,
  isDue,
  judgePage,
  nextCheckAt,
  squeezeSeparators,
  summarizeMonitor,
} from "../monitor";

const profile = ListingProfileSchema.parse({ name: "テスト商会 新宿店", phone: "03-1234-5678", address: "東京都新宿区新宿1-1-1" });
const NOW = new Date("2026-09-20T00:00:00.000Z");

describe("judgePage", () => {
  it("店名と電話が出ていれば live", () => {
    const out = judgePage({ status: 200, text: "テスト商会 新宿店 / TEL 03-1234-5678 / 東京都新宿区" }, profile);
    expect(out.result).toBe("live");
    expect(out.nameFound).toBe(true);
    expect(out.phoneFound).toBe(true);
  });

  it("全角・区切りの違いを吸収する", () => {
    const out = judgePage({ status: 200, text: "ＴＥＳＴ　テスト商会　新宿店　０３（１２３４）５６７８" }, profile);
    expect(out.result).toBe("live");
  });

  // 媒体側が電話番号を書き換えた / 古いまま = NAP のずれ。これを拾うのがこの機能の値打ち
  it("店名はあるが電話が無ければ changed", () => {
    const out = judgePage({ status: 200, text: "テスト商会 新宿店 の紹介ページです" }, profile);
    expect(out.result).toBe("changed");
    expect(out.message).toContain("電話番号が見当たりません");
  });

  // ここが肝。読めないことと消えたことは違う
  it("店名が読めないだけでは gone にせず unknown にする", () => {
    const out = judgePage({ status: 200, text: "<div id=app></div>" }, profile);
    expect(out.result).toBe("unknown");
    expect(out.message).toContain("JavaScript");
  });

  it("404 / 410 のときだけ gone", () => {
    expect(judgePage({ status: 404, text: "" }, profile).result).toBe("gone");
    expect(judgePage({ status: 410, text: "" }, profile).result).toBe("gone");
  });

  it("つながらない・サーバーエラーは unreachable", () => {
    expect(judgePage({ status: 0, text: "" }, profile).result).toBe("unreachable");
    expect(judgePage({ status: 503, text: "" }, profile).result).toBe("unreachable");
    expect(judgePage({ status: 301, text: "" }, profile).result).toBe("unreachable");
  });

  it("電話が未登録なら電話では判定しない", () => {
    const noPhone = ListingProfileSchema.parse({ name: "テスト商会 新宿店" });
    expect(judgePage({ status: 200, text: "テスト商会 新宿店" }, noPhone).result).toBe("live");
  });
});

describe("次に見に行く時刻", () => {
  it("問題があるものほど早く見直す", () => {
    expect(CHECK_INTERVAL_DAYS.live).toBeGreaterThan(CHECK_INTERVAL_DAYS.unknown);
    expect(CHECK_INTERVAL_DAYS.unknown).toBeGreaterThan(CHECK_INTERVAL_DAYS.gone);
    expect(CHECK_INTERVAL_DAYS.gone).toBeGreaterThan(CHECK_INTERVAL_DAYS.unreachable);
  });

  it("結果に応じた日数を足す", () => {
    expect(nextCheckAt("live", NOW)).toBe("2026-10-20T00:00:00.000Z");
    expect(nextCheckAt("unreachable", NOW)).toBe("2026-09-23T00:00:00.000Z");
  });
});

describe("確認の対象", () => {
  it("URL を控えていて対象外でないものだけ", () => {
    expect(isCheckable(ListingStateSchema.parse({ status: "live", url: "https://example.com/x" }))).toBe(true);
    expect(isCheckable(ListingStateSchema.parse({ status: "live", url: "" }))).toBe(false);
    expect(isCheckable(ListingStateSchema.parse({ status: "skip", url: "https://example.com/x" }))).toBe(false);
    expect(isCheckable(ListingStateSchema.parse({ status: "todo", url: "メモ" }))).toBe(false);
  });

  it("一度も見ていなければ対象、次回を過ぎていれば対象", () => {
    const never = ListingStateSchema.parse({ status: "live", url: "https://example.com/x" });
    expect(isDue(never, NOW)).toBe(true);
    const future = ListingStateSchema.parse({ status: "live", url: "https://example.com/x", nextCheckAt: "2026-10-01T00:00:00.000Z" });
    expect(isDue(future, NOW)).toBe(false);
    const past = ListingStateSchema.parse({ status: "live", url: "https://example.com/x", nextCheckAt: "2026-09-01T00:00:00.000Z" });
    expect(isDue(past, NOW)).toBe(true);
  });

  it("対象の媒体 id を集める", () => {
    const states: ListingStates = {
      YAHOO_PLACE: ListingStateSchema.parse({ status: "live", url: "https://a.example/1" }),
      BING: ListingStateSchema.parse({ status: "live", url: "https://b.example/1", nextCheckAt: "2099-01-01T00:00:00.000Z" }),
      EKITEN: ListingStateSchema.parse({ status: "skip", url: "https://c.example/1" }),
    };
    expect(dueMediaIds(states, NOW)).toEqual(["YAHOO_PLACE"]);
  });
});

describe("結果の書き戻し", () => {
  // 掲載の状況（未登録 / 申請中 / 掲載済み）は人が決めるもの。機械で上書きしない
  it("掲載の状況・URL・メモは変えない", () => {
    const before = ListingStateSchema.parse({ status: "live", url: "https://example.com/x", note: "担当: 山田" });
    const after = applyCheck(before, judgePage({ status: 404, text: "" }, profile), NOW);
    expect(after.status).toBe("live");
    expect(after.url).toBe("https://example.com/x");
    expect(after.note).toBe("担当: 山田");
    expect(after.checkResult).toBe("gone");
    expect(after.lastCheckedAt).toBe(NOW.toISOString());
    expect(after.nextCheckAt).toBe(nextCheckAt("gone", NOW));
  });
});

describe("集計", () => {
  it("確認できる数・確認済み・問題ありを数える", () => {
    const states: ListingStates = {
      A: ListingStateSchema.parse({ status: "live", url: "https://a.example/1", lastCheckedAt: "2026-09-10T00:00:00.000Z", checkResult: "live" }),
      B: ListingStateSchema.parse({ status: "live", url: "https://b.example/1", lastCheckedAt: "2026-09-19T00:00:00.000Z", checkResult: "changed" }),
      C: ListingStateSchema.parse({ status: "live", url: "https://c.example/1" }),
      D: ListingStateSchema.parse({ status: "todo", url: "" }),
    };
    expect(summarizeMonitor(states, ["A", "B", "C", "D"])).toEqual({
      checkable: 3,
      checked: 2,
      live: 1,
      problems: 1,
      oldestCheckedAt: "2026-09-10T00:00:00.000Z",
    });
  });
});

describe("文字の扱い", () => {
  it("区切り記号だけを詰める（文字は境界として残す）", () => {
    expect(squeezeSeparators("03-1234-5678")).toBe("0312345678");
    expect(squeezeSeparators("０３（１２３４）５６７８")).toBe("0312345678");
    expect(digitsOf("TEL: 03-1234-5678")).toBe("0312345678");
  });

  // 本文だけだと、店名が属性や JSON の中にしか無いページで「読めない」になりやすい
  it("検索用の文字列は本文と生の HTML の両方を含む", () => {
    const text = searchableText('<html><body><div data-shop="テスト商会 新宿店">表示名</div><script>var a=1</script></body></html>');
    expect(text).toContain("表示名");
    expect(text).toContain("テスト商会 新宿店");
    // script の中身は本文としては数えないが、生の HTML 側には残る
    expect(text.split("\n")[0]).not.toContain("var a=1");
  });
});
