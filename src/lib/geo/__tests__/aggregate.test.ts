import { describe, expect, it } from "vitest";
import {
  availableModels,
  brandedMetrics,
  byModel,
  byTag,
  detectVersionChange,
  filterTargetsByModel,
  rollingShares,
  rollingTargetShares,
  shares,
  targetShares,
  toAggregates,
  withinDays,
  type AggregateInput,
  type LabeledTargetShare,
} from "../aggregate";
import { citationMix, classifyDomain, findAliasCandidates, judgeCitation, needsReview } from "../extract";
import type { GeoBrand, GeoCitation } from "../types";

const NOW = new Date("2026-09-16T03:00:00Z");

function obs(over: Partial<AggregateInput> = {}): AggregateInput {
  return {
    brandId: "own",
    promptId: "p1",
    keywordId: null,
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

/* ───────────── 計測対象ごとの出現率（棒グラフ。利用者の指示 2026-09-20） ───────────── */

describe("targetShares", () => {
  it("プロンプトごとに自社の言及率と Wilson 区間を出す", () => {
    const rows = [
      ...Array.from({ length: 3 }, () => obs({ promptId: "p1", mentioned: true })),
      obs({ promptId: "p1", mentioned: false }),
      obs({ promptId: "p2", mentioned: false }),
      obs({ promptId: "p2", mentioned: false }),
    ];
    const out = targetShares(rows, { brandId: "own", axis: "prompt", metric: "mention" });
    expect(out.map((r) => r.targetId)).toEqual(["p1", "p2"]); // 率の高い順
    const p1 = out[0];
    expect(p1).toMatchObject({ n: 4, hits: 3, rate: 0.75 });
    // 帯は点推定をまたぎ、n が小さいので広い
    expect(p1.ciLow).toBeLessThan(0.75);
    expect(p1.ciHigh).toBeGreaterThan(0.75);
    expect(p1.spread).toBeGreaterThan(0.3);
    expect(out[1]).toMatchObject({ n: 2, hits: 0, rate: 0, band: "none" });
  });

  it("キーワード軸では AI Overviews の引用を数える（言及ではなく）", () => {
    const rows = [
      obs({ promptId: null, keywordId: "k1", model: "aio", cited: true, mentioned: false }),
      obs({ promptId: null, keywordId: "k1", model: "aio", cited: false, mentioned: true }),
    ];
    const out = targetShares(rows, { brandId: "own", axis: "keyword", metric: "citation" });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ targetId: "k1", n: 2, hits: 1, rate: 0.5 });
  });

  it("競合の観測は混ぜない。軸に合わない行（ID が null）は落とす", () => {
    const rows = [
      obs({ promptId: "p1", mentioned: true }),
      obs({ brandId: "rival", promptId: "p1", mentioned: true }),
      obs({ promptId: null, keywordId: "k1", mentioned: true }),
    ];
    const out = targetShares(rows, { brandId: "own", axis: "prompt", metric: "mention" });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ targetId: "p1", n: 1, hits: 1 });
  });

  it("モデル別の内訳を持つ", () => {
    const rows = [
      obs({ promptId: "p1", model: "chatgpt", mentioned: true }),
      obs({ promptId: "p1", model: "chatgpt", mentioned: false }),
      obs({ promptId: "p1", model: "gemini", mentioned: true }),
    ];
    const [row] = targetShares(rows, { brandId: "own", axis: "prompt", metric: "mention" });
    expect(row.perModel).toHaveLength(2);
    expect(row.perModel.find((m) => m.model === "chatgpt")).toMatchObject({ n: 2, hits: 1, rate: 0.5 });
    expect(row.perModel.find((m) => m.model === "gemini")).toMatchObject({ n: 1, hits: 1, rate: 1 });
  });

  it("rollingTargetShares は 4 週より古い観測を外す", () => {
    const rows = [
      obs({ promptId: "p1", mentioned: true }),
      obs({ promptId: "p1", mentioned: true, executedAt: "2026-07-01T00:00:00Z" }),
    ];
    const [row] = rollingTargetShares(rows, { brandId: "own", axis: "prompt", metric: "mention" }, NOW);
    expect(row.n).toBe(1);
  });

  it("観測ゼロなら行を作らない", () => {
    expect(targetShares([], { brandId: "own", axis: "prompt", metric: "mention" })).toEqual([]);
  });
});

describe("filterTargetsByModel", () => {
  const labeled = (over: Partial<LabeledTargetShare> = {}): LabeledTargetShare => ({
    targetId: "p1",
    label: "おすすめの SEO ツールは？",
    n: 3,
    hits: 2,
    rate: 2 / 3,
    ciLow: 0.2,
    ciHigh: 0.94,
    band: "often",
    spread: 0.74,
    perModel: [
      { model: "chatgpt", n: 2, hits: 2, rate: 1 },
      { model: "gemini", n: 1, hits: 0, rate: 0 },
    ],
    ...over,
  });

  it("all はそのまま返す", () => {
    const rows = [labeled()];
    expect(filterTargetsByModel(rows, "all")).toEqual(rows);
  });

  it("モデルで絞ると n が減り、帯は広くなる", () => {
    const before = labeled();
    const [after] = filterTargetsByModel([before], "chatgpt");
    expect(after).toMatchObject({ targetId: "p1", label: before.label, n: 2, hits: 2, rate: 1 });
    expect(after.spread).toBeGreaterThan(0.3);
    expect(after.ciLow).toBeLessThan(1);
    expect(after.perModel).toHaveLength(1);
  });

  it("そのモデルの観測が無い行は落とす", () => {
    expect(filterTargetsByModel([labeled({ perModel: [{ model: "chatgpt", n: 0, hits: 0, rate: 0 }] })], "chatgpt")).toEqual([]);
    expect(filterTargetsByModel([labeled()], "aio")).toEqual([]);
  });

  it("availableModels は内訳にあるモデルだけを返す", () => {
    expect(availableModels([labeled()])).toEqual(["chatgpt", "gemini"]);
    expect(availableModels([])).toEqual([]);
  });
});
