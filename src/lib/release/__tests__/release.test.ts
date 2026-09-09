/**
 * バージョン（マージ回数）のテスト。
 * 番号はファイルに書かず並び順から振るので、その規則をここで固定する。
 */
import { describe, expect, it } from "vitest";
import { shortCommit } from "../build";
import { parseReleases, RELEASES, releaseCount, releaseLabel } from "../catalog";

describe("リリース履歴の読み取り", () => {
  it("並び順どおりに 1 から番号を振る", () => {
    const rows = parseReleases({
      releases: [
        { commit: "aaaaaaa", date: "2026-01-01", summary: "最初" },
        { commit: "bbbbbbb", date: "2026-01-02", summary: "次" },
      ],
    });
    expect(rows.map((r) => r.number)).toEqual([1, 2]);
    expect(rows[1].summary).toBe("次");
  });

  // 番号を二重に持つとずれるので、ファイル側の number は見ない
  it("ファイルに書かれた番号は無視する", () => {
    const rows = parseReleases({
      releases: [{ commit: "aaaaaaa", date: "2026-01-01", number: 99 }],
    });
    expect(rows[0].number).toBe(1);
  });

  it("コミットは小文字にそろえる", () => {
    expect(parseReleases({ releases: [{ commit: "ABCDEF1", date: "2026-01-01" }] })[0].commit).toBe(
      "abcdef1",
    );
  });

  it("壊れた行は捨てて、番号は詰め直す", () => {
    const rows = parseReleases({
      releases: [
        { commit: "aaaaaaa", date: "2026-01-01" },
        { commit: "xyz", date: "2026-01-02" }, // SHA でない
        { commit: "bbbbbbb", date: "01/03" }, // 日付でない
        null,
        { commit: "ccccccc", date: "2026-01-04" },
      ],
    });
    expect(rows.map((r) => r.commit)).toEqual(["aaaaaaa", "ccccccc"]);
    expect(rows.map((r) => r.number)).toEqual([1, 2]);
  });

  it("壊れた値は空", () => {
    expect(parseReleases(null)).toEqual([]);
    expect(parseReleases({})).toEqual([]);
    expect(parseReleases({ releases: "x" })).toEqual([]);
  });
});

describe("版名", () => {
  it("r + 番号", () => {
    expect(releaseLabel(1)).toBe("r1");
    expect(releaseLabel(10)).toBe("r10");
  });

  it("0 件のときは —", () => {
    expect(releaseLabel(0)).toBe("—");
  });
});

describe("同梱の releases.json", () => {
  it("1 件以上あり、番号が連番になっている", () => {
    expect(RELEASES.length).toBeGreaterThan(0);
    expect(RELEASES.map((r) => r.number)).toEqual(RELEASES.map((_, i) => i + 1));
    expect(releaseCount()).toBe(RELEASES.length);
  });

  // 同じコミットが 2 回入ると、マージ回数が水増しされる
  it("コミットが重複していない", () => {
    const commits = RELEASES.map((r) => r.commit);
    expect(new Set(commits).size).toBe(commits.length);
  });

  it("日付が古い順に並んでいる", () => {
    const dates = RELEASES.map((r) => r.date);
    expect([...dates].sort()).toEqual(dates);
  });
});

describe("デプロイ中のコミット", () => {
  it("短縮 SHA にそろえる", () => {
    expect(shortCommit("5752738abcdef1234567890abcdef1234567890a")).toBe("5752738");
    expect(shortCommit("5752738")).toBe("5752738");
    expect(shortCommit(" 5752738ABC ")).toBe("5752738");
  });

  it("SHA でなければ null", () => {
    expect(shortCommit(undefined)).toBeNull();
    expect(shortCommit("")).toBeNull();
    expect(shortCommit("main")).toBeNull();
  });
});
