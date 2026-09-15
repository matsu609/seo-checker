import { describe, expect, it } from "vitest";
import { scoreAge, scoreBrand, scoreDomainPower, scoreIndex, scoreKeyword, scoreLinks, scoreTraffic, type ScoreDomainPowerInput } from "../score";

const NOW = new Date("2026-09-15T00:00:00.000Z");

const base: ScoreDomainPowerInput = {
  host: "example.com",
  openPageRank: null,
  registeredAt: null,
  indexedPages: null,
  brandRank: null,
  brandMeasured: false,
  keywordRanks: [],
  cruxCoverage: "unknown",
  crawledPages: null,
  internalLinks: null,
  trust: null,
  https: true,
  sources: { openPageRank: false, rdap: false, serp: false, crux: false },
  now: NOW,
};

describe("指標ごとの採点", () => {
  it("外部リンクの評価は Open PageRank の段階で決まる", () => {
    expect(scoreLinks(6.2, null).score).toBe(25);
    expect(scoreLinks(3.0, null).status).toBe("fair");
    expect(scoreLinks(0.4, null).score).toBe(0);
    expect(scoreLinks(null, null).status).toBe("unknown");
    expect(scoreLinks(4.5, 120_000).detail).toContain("120,000 位");
  });

  it("ドメインの年数は 10 年で満点", () => {
    expect(scoreAge("2010-01-01T00:00:00.000Z", NOW).score).toBe(15);
    expect(scoreAge("2024-01-01T00:00:00.000Z", NOW).status).toBe("fair");
    expect(scoreAge("2026-06-01T00:00:00.000Z", NOW).status).toBe("poor");
    expect(scoreAge(null, NOW).status).toBe("unknown");
  });

  it("インデックス数はクロール結果と比べる文を添える", () => {
    expect(scoreIndex(1200, 300).score).toBe(15);
    expect(scoreIndex(12, 40).status).toBe("fair");
    expect(scoreIndex(0, 40).score).toBe(0);
    expect(scoreIndex(80, 100).detail).toContain("100 ページ");
    expect(scoreIndex(null, 100).status).toBe("unknown");
  });

  it("対策キーワードは順位の良さの平均で決まる", () => {
    expect(scoreKeyword([1, 2, 3]).score).toBe(15);
    expect(scoreKeyword([null, null, null]).score).toBe(0);
    expect(scoreKeyword([5, null]).value).toBe("1 / 2 語が 10 位以内");
    expect(scoreKeyword([]).status).toBe("unknown");
  });

  it("ブランド名検索は 1 位で満点、未計測は分母から外す", () => {
    expect(scoreBrand(1, true).score).toBe(10);
    expect(scoreBrand(null, true).score).toBe(0);
    expect(scoreBrand(null, false).status).toBe("unknown");
  });

  it("CrUX にデータがあること自体を規模の目安にする", () => {
    expect(scoreTraffic("url").score).toBe(10);
    expect(scoreTraffic("origin").score).toBe(7);
    expect(scoreTraffic("none").status).toBe("poor");
    expect(scoreTraffic("unknown").status).toBe("unknown");
  });
});

describe("合計点", () => {
  it("未取得の指標は分母から外す（キーが無くても不当に低く出ない）", () => {
    const result = scoreDomainPower({
      ...base,
      registeredAt: "2010-01-01T00:00:00.000Z",
      cruxCoverage: "origin",
      crawledPages: 120,
      internalLinks: 400,
      trust: { pass: 8, total: 9 },
      https: true,
    });
    // 採点できたのは年数（15）・実ユーザー（10）・規模（5）・信頼（5）だけ
    expect(result.measuredMax).toBe(35);
    expect(result.score).toBe(Math.round(((15 + 7 + 4 + 5) / 35) * 100));
    expect(result.signals.filter((s) => s.status === "unknown")).toHaveLength(4);
    expect(result.notes.join()).toContain("未取得の指標");
  });

  it("指標が少なすぎるときは合計点を出さない", () => {
    const result = scoreDomainPower({ ...base, crawledPages: 120, internalLinks: 400, trust: { pass: 8, total: 9 }, https: true });
    expect(result.measuredMax).toBe(10);
    expect(result.score).toBeNull();
    expect(result.notes.join()).toContain("採点に使える指標が足りない");
  });

  it("すべて取れていれば 100 点満点で採点する", () => {
    const result = scoreDomainPower({
      ...base,
      openPageRank: 6.5,
      registeredAt: "2010-01-01T00:00:00.000Z",
      indexedPages: 5000,
      brandRank: 1,
      brandMeasured: true,
      keywordRanks: [1, 2, 3],
      cruxCoverage: "url",
      crawledPages: 300,
      internalLinks: 2000,
      trust: { pass: 9, total: 9 },
      https: true,
    });
    expect(result.measuredMax).toBe(100);
    expect(result.score).toBe(100);
    expect(result.grade).toBe("very-strong");
    expect(result.notes).toHaveLength(0);
  });

  it("何も取れなければ点は付けない", () => {
    const result = scoreDomainPower(base);
    expect(result.score).toBeNull();
    expect(result.grade).toBeNull();
    expect(result.measuredMax).toBe(0);
  });

  it("弱いサイトは低く出る", () => {
    const result = scoreDomainPower({
      ...base,
      openPageRank: 0.5,
      registeredAt: "2026-06-01T00:00:00.000Z",
      indexedPages: 3,
      brandRank: null,
      brandMeasured: true,
      keywordRanks: [null, null],
      cruxCoverage: "none",
      crawledPages: 6,
      internalLinks: 12,
      trust: { pass: 1, total: 9 },
      https: true,
    });
    expect(result.score).toBeLessThan(20);
    expect(result.grade).toBe("very-weak");
  });
});
