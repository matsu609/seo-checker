import { describe, expect, it } from "vitest";
import { brandedMetrics, byModel, byTag, detectVersionChange, rollingShares, shares, toAggregates, withinDays, type AggregateInput } from "../aggregate";
import { citationMix, classifyDomain, findAliasCandidates, judgeCitation, needsReview } from "../extract";
import type { GeoBrand, GeoCitation } from "../types";

const NOW = new Date("2026-09-16T03:00:00Z");

function obs(over: Partial<AggregateInput> = {}): AggregateInput {
  return {
    brandId: "own",
    promptId: "p1",
    tags: [],
    isBranded: false,
    model: "chatgpt",
    executedAt: "2026-09-15T03:00:00Z",
    mentioned: false,
    cited: false,
    domainClasses: [],
    ...over,
  };
}

function brand(over: Partial<GeoBrand> = {}): GeoBrand {
  return {
    id: "own",
    type: "own",
    displayName: "サンプル工房",
    aliases: ["サンプルコウボウ", "Sample Kobo", "サンプル"],
    domains: ["sample-kobo.jp"],
    aliasesUpdatedAt: null,
    createdAt: "2026-09-01T00:00:00Z",
    ...over,
  };
}

describe("シェアの集計（§3.3）", () => {
  it("参照率・引用率と Wilson 区間を出す", () => {
    const rows = [
      ...Array.from({ length: 8 }, () => obs({ mentioned: true, cited: true })),
      ...Array.from({ length: 4 }, () => obs({ mentioned: false })),
    ];
    const [result] = shares(rows);
    expect(result.n).toBe(12);
    expect(result.shareMention).toBeCloseTo(8 / 12);
    expect(result.shareCitation).toBeCloseTo(8 / 12);
    expect(result.ciLow).toBeLessThan(result.shareMention);
    expect(result.ciHigh).toBeGreaterThan(result.shareMention);
    expect(result.band).toBe("often");
  });

  it("ブランドごとに分かれ、参照率の高い順に並ぶ", () => {
    const rows = [
      obs({ brandId: "own", mentioned: true }),
      obs({ brandId: "own", mentioned: false }),
      obs({ brandId: "rival", mentioned: true }),
      obs({ brandId: "rival", mentioned: true }),
    ];
    const result = shares(rows);
    expect(result.map((r) => r.brandId)).toEqual(["rival", "own"]);
  });

  it("観測が無いブランドは 0 で割らない", () => {
    expect(shares([])).toEqual([]);
  });
});

describe("4 週ローリング（§5.1-1）", () => {
  it("28 日より古い観測は落とす", () => {
    const rows = [
      obs({ executedAt: "2026-09-15T00:00:00Z", mentioned: true }),
      obs({ executedAt: "2026-07-01T00:00:00Z", mentioned: true }),
    ];
    expect(withinDays(rows, 28, NOW)).toHaveLength(1);
    expect(rollingShares(rows, NOW)[0].n).toBe(1);
  });
});

describe("表示の切り口（§3.4）", () => {
  it("モデル別に分ける", () => {
    const grouped = byModel([obs({ model: "chatgpt" }), obs({ model: "gemini" }), obs({ model: "gemini" })]);
    expect(grouped.get("chatgpt")).toHaveLength(1);
    expect(grouped.get("gemini")).toHaveLength(2);
  });

  it("タグ別に分ける。all には全部入る", () => {
    const grouped = byTag([obs({ tags: ["比較"] }), obs({ tags: [] })]);
    expect(grouped.get("all")).toHaveLength(2);
    expect(grouped.get("比較")).toHaveLength(1);
  });

  it("保存用の行にはモデル別とモデル横断（all）の両方が入る", () => {
    const rows = toAggregates([obs({ mentioned: true }), obs({ model: "gemini" })], "rolling4w", NOW);
    expect(rows.some((r) => r.model === "chatgpt")).toBe(true);
    expect(rows.some((r) => r.model === "all")).toBe(true);
    expect(rows.every((r) => r.window === "rolling4w")).toBe(true);
    expect(rows.every((r) => r.periodStart === "2026-09-14")).toBe(true);
  });
});

describe("指名プロンプトの主指標（§3.2）", () => {
  it("自社引用率・引用元構成比・競合同時言及率を出す", () => {
    const rows: AggregateInput[] = [
      obs({ isBranded: true, brandId: "own", cited: true, mentioned: true, domainClasses: ["own", "third_party"], executedAt: "2026-09-15T01:00:00Z" }),
      obs({ isBranded: true, brandId: "own", cited: false, mentioned: true, domainClasses: ["third_party"], executedAt: "2026-09-15T02:00:00Z" }),
      obs({ isBranded: true, brandId: "rival", mentioned: true, executedAt: "2026-09-15T01:00:00Z" }),
    ];
    const m = brandedMetrics(rows, "own");
    expect(m.n).toBe(2);
    expect(m.ownCitationRate).toBe(0.5);
    expect(m.citationMix).toEqual({ own: 1, competitor: 0, third_party: 2 });
    expect(m.competitorCoMentionRate).toBe(0.5);
  });

  it("指名でないプロンプトは混ぜない", () => {
    expect(brandedMetrics([obs({ isBranded: false, brandId: "own" })], "own").n).toBe(0);
  });
});

describe("引用と参照の判定（§3.1 / §4.3）", () => {
  const own = brand();
  const rival = brand({ id: "rival", type: "competitor", displayName: "ライバル社", aliases: ["Rival"], domains: ["rival.co.jp"] });

  function cite(url: string, unresolved = false): GeoCitation {
    return { url, unresolved, domain: unresolved ? "" : new URL(url).hostname.replace(/^www\./, ""), title: null };
  }

  it("自社ドメインが引用されていれば cited（サブドメインも数える）", () => {
    const result = judgeCitation([cite("https://blog.sample-kobo.jp/a"), cite("https://other.com/b")], own);
    expect(result.cited).toBe(true);
    expect(result.domains).toEqual(["blog.sample-kobo.jp"]);
  });

  it("解決できなかった引用は自社判定に使わない", () => {
    expect(judgeCitation([cite("https://vertexaisearch.cloud.google.com/x", true)], own).cited).toBe(false);
  });

  it("ドメインを自社 / 競合 / 第三者に分ける", () => {
    expect(classifyDomain("sample-kobo.jp", own, [rival])).toBe("own");
    expect(classifyDomain("rival.co.jp", own, [rival])).toBe("competitor");
    expect(classifyDomain("note.com", own, [rival])).toBe("third_party");
  });

  it("引用元の構成比を数える（不明ドメインは除く）", () => {
    const mix = citationMix(
      [cite("https://sample-kobo.jp/a"), cite("https://rival.co.jp/b"), cite("https://note.com/c"), cite("https://x/y", true)],
      own,
      [rival],
    );
    expect(mix).toEqual({ own: 1, competitor: 1, third_party: 1 });
  });

  it("エイリアスは全角半角・大小文字を吸収して探す", () => {
    expect(findAliasCandidates("おすすめは ＳＡＭＰＬＥ　ＫＯＢＯ です", own).mentioned).toBe(true);
    expect(findAliasCandidates("サンプルコウボウが有名です", own).matched).toBe("サンプルコウボウ");
    expect(findAliasCandidates("まったく関係ない話", own).mentioned).toBe(false);
  });

  it("文字列一致だけの判定は確信度を下げ、要確認にする（§4.2）", () => {
    const hit = findAliasCandidates("サンプルを見てください", own);
    expect(hit.mentioned).toBe(true);
    expect(hit.confidence).toBeLessThan(0.7);
    expect(needsReview(hit)).toBe(true);
  });
});

describe("モデル更新の検知（§5.3）", () => {
  it("バージョンが変わったときだけイベントにする", () => {
    expect(detectVersionChange("gpt-5.1", "gpt-5.2").changed).toBe(true);
    expect(detectVersionChange("gpt-5.1", "gpt-5.1").changed).toBe(false);
    expect(detectVersionChange(null, "gpt-5.1").changed).toBe(false);
    expect(detectVersionChange("gpt-5.1", null).changed).toBe(false);
  });
});
