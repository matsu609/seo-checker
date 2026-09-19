/**
 * 外部からの評価（旧・ドメインパワー）。
 * 利用者の決定（2026-09-19）「打ち手のある項目だけを採点する」を固定する:
 * 判定するのは被リンクとインデックス数の 2 つだけで、総合点は出さない。
 */
import { describe, expect, it } from "vitest";
import { buildExternalEvaluation, scoreIndex, scoreLinks } from "../score";
import { SIGNAL_ACTIONS, type DomainPowerSignalId } from "../types";

const SOURCES = { ahrefs: true, openPageRank: false, rdap: true, serp: true };

describe("打ち手のある 2 指標だけを出す", () => {
  it("判定は被リンクとインデックス数のみ。年数・順位・実ユーザー規模は含めない", () => {
    const r = buildExternalEvaluation({
      host: "example.jp",
      ahrefsDr: 12,
      openPageRank: null,
      registeredAt: "2015-03-24T00:00:00.000Z",
      indexedPages: 66,
      crawledPages: 63,
      sources: SOURCES,
      now: new Date("2026-09-19T00:00:00Z"),
    });
    expect(r.signals.map((s) => s.id)).toEqual<DomainPowerSignalId[]>(["links", "index"]);
    // 総合点・グレードは存在しない（型にもレスポンスにも無い）
    expect(r).not.toHaveProperty("score");
    expect(r).not.toHaveProperty("grade");
    // 年数は採点しないが、競合比較の文脈として残す
    expect(r.ageYears).toBeCloseTo(11.5, 0);
  });

  it("すべての指標に「次にやること」がある", () => {
    for (const id of ["links", "index"] as DomainPowerSignalId[]) {
      expect(SIGNAL_ACTIONS[id].length).toBeGreaterThan(10);
    }
  });
});

describe("被リンクの評価", () => {
  it("DR があれば DR、無ければ Open PageRank。どちらも無ければ未取得", () => {
    expect(scoreLinks(35, 3, null).status).toBe("good");
    expect(scoreLinks(12, null, null).status).toBe("fair");
    // 中小企業では DR 0 が普通なので、赤ではなく「これから」に寄せる
    expect(scoreLinks(0, null, null).status).toBe("poor");
    expect(scoreLinks(0, null, null).value).toBe("DR 0 / 100");
    expect(scoreLinks(null, 4.2, 900_000).status).toBe("good");
    expect(scoreLinks(null, 4.2, 900_000).detail).toContain("世界順位 900,000 位");
    expect(scoreLinks(null, null, null).status).toBe("unknown");
  });
});

describe("インデックス数", () => {
  it("クロールで見つけた数と比べて、載っていないページがあるかで判定する", () => {
    expect(scoreIndex(60, 63).status).toBe("good");
    expect(scoreIndex(45, 63).status).toBe("fair");
    expect(scoreIndex(5, 63).status).toBe("poor");
    expect(scoreIndex(5, 63).detail).toContain("載っていないページがある可能性");
    expect(scoreIndex(null, 63).status).toBe("unknown");
  });

  it("クロール数が無ければ件数だけで判定する", () => {
    expect(scoreIndex(200, null).status).toBe("good");
    expect(scoreIndex(2, null).status).toBe("poor");
  });
});
