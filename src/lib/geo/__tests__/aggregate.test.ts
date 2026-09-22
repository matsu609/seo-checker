import { describe, expect, it } from "vitest";
import {
  availableModels,
  brandedMetrics,
  byModel,
  byTag,
  detectVersionChange,
  filterTargetsByModel,
  applyFilter,
  comingWeekStarts,
  domainCitations,
  PERIOD_OPTIONS,
  recentWeekStarts,
  rollingShares,
  SAMPLE_FALLBACK_LABELS,
  SAMPLE_SERIES_MAX,
  SAMPLE_WEEKS,
  sampleSeries,
  rollingTargetShares,
  shares,
  targetShares,
  toAggregates,
  weeklySeries,
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
    citedDomains: [],
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

/* ───────────── 週ごとの推移（折れ線。利用者の指示 2026-09-21） ───────────── */

describe("weeklySeries", () => {
  // NOW = 2026-09-16（水）。その週の月曜は 09-14
  const LABELS = new Map([
    ["k1", "SEO ツール"],
    ["k2", "AIO 対策"],
  ]);
  const opts = { brandId: "own", axis: "keyword" as const, metric: "citation" as const, labels: LABELS, weeks: 4 };

  it("週の枠を必ず weeks 本ぶん作り、古い順に並べる", () => {
    const weeks = recentWeekStarts(4, NOW);
    expect(weeks).toEqual(["2026-08-24", "2026-08-31", "2026-09-07", "2026-09-14"]);
    const [s] = weeklySeries([obs({ promptId: null, keywordId: "k1", cited: true })], opts, NOW);
    expect(s.points.map((p) => p.weekStart)).toEqual(weeks);
  });

  it("観測の無い週は 0% ではなく null にする（線を切って「未計測」と分かるように）", () => {
    const rows = [
      obs({ promptId: null, keywordId: "k1", cited: true, executedAt: "2026-09-15T03:00:00Z" }),
      obs({ promptId: null, keywordId: "k1", cited: false, executedAt: "2026-08-25T03:00:00Z" }),
    ];
    const [s] = weeklySeries(rows, opts, NOW);
    expect(s.points.map((p) => p.rate)).toEqual([0, null, null, 1]);
    expect(s.points.map((p) => p.n)).toEqual([1, 0, 0, 1]);
  });

  it("同じ週の複数の観測はまとめて率にする", () => {
    const rows = [
      obs({ promptId: null, keywordId: "k1", cited: true, executedAt: "2026-09-14T03:00:00Z" }),
      obs({ promptId: null, keywordId: "k1", cited: false, executedAt: "2026-09-15T03:00:00Z" }),
      obs({ promptId: null, keywordId: "k1", cited: true, executedAt: "2026-09-16T03:00:00Z" }),
    ];
    const [s] = weeklySeries(rows, opts, NOW);
    const last = s.points[s.points.length - 1];
    expect(last).toMatchObject({ n: 3, hits: 2 });
    expect(last.rate).toBeCloseTo(2 / 3);
    expect(s.totalN).toBe(3);
  });

  it("latest は直近で値のある週。全部未計測なら null", () => {
    const rows = [obs({ promptId: null, keywordId: "k1", cited: true, executedAt: "2026-08-25T03:00:00Z" })];
    expect(weeklySeries(rows, opts, NOW)[0].latest).toBe(1);
    expect(weeklySeries([], opts, NOW)).toEqual([]);
  });

  it("枠の外（古すぎる）観測は捨てる", () => {
    const rows = [obs({ promptId: null, keywordId: "k1", cited: true, executedAt: "2026-06-01T03:00:00Z" })];
    expect(weeklySeries(rows, opts, NOW)).toEqual([]);
  });

  it("ラベルの無い対象（設定から消えたキーワード）は線にしない", () => {
    const rows = [obs({ promptId: null, keywordId: "消えた", cited: true })];
    expect(weeklySeries(rows, opts, NOW)).toEqual([]);
  });

  it("競合の観測は混ぜない", () => {
    const rows = [
      obs({ promptId: null, keywordId: "k1", cited: true }),
      obs({ brandId: "rival", promptId: null, keywordId: "k1", cited: true }),
    ];
    expect(weeklySeries(rows, opts, NOW)[0].totalN).toBe(1);
  });

  it("並びは直近の率が高い順", () => {
    const rows = [
      obs({ promptId: null, keywordId: "k1", cited: false }),
      obs({ promptId: null, keywordId: "k2", cited: true }),
    ];
    expect(weeklySeries(rows, opts, NOW).map((s) => s.targetId)).toEqual(["k2", "k1"]);
  });

  it("プロンプト軸では言及を数える", () => {
    const labels = new Map([["p1", "おすすめの SEO ツールは？"]]);
    const rows = [obs({ promptId: "p1", mentioned: true, cited: false })];
    const [s] = weeklySeries(rows, { brandId: "own", axis: "prompt", metric: "mention", labels, weeks: 4 }, NOW);
    expect(s.label).toBe("おすすめの SEO ツールは？");
    expect(s.latest).toBe(1);
  });
});

/* ───────────── 見本の線（イメージ。利用者の指示 2026-09-21） ───────────── */

describe("sampleSeries（実測ではない見本）", () => {
  it("横軸は過去ではなく「これからの週」（もう測った数字に見せない）", () => {
    // NOW = 2026-09-16（水）。その週の月曜は 09-14
    expect(comingWeekStarts(SAMPLE_WEEKS, NOW)).toEqual(["2026-09-14", "2026-09-21", "2026-09-28", "2026-10-05"]);
    // recentWeekStarts（実測用）は逆に過去へ伸びる
    expect(recentWeekStarts(SAMPLE_WEEKS, NOW)[0] < comingWeekStarts(SAMPLE_WEEKS, NOW)[0]).toBe(true);
  });

  it("利用者が登録した言葉を使う。無ければ一般的な例に置き換える", () => {
    const weeks = comingWeekStarts(SAMPLE_WEEKS, NOW);
    expect(sampleSeries(["SEO ツール", "AIO 対策"], weeks).map((s) => s.label)).toEqual(["SEO ツール", "AIO 対策"]);
    expect(sampleSeries([], weeks).map((s) => s.label)).toEqual([...SAMPLE_FALLBACK_LABELS]);
  });

  it("線は多くても 3 本（図が読めなくならないように）", () => {
    const weeks = comingWeekStarts(SAMPLE_WEEKS, NOW);
    const many = ["a", "b", "c", "d", "e", "f"];
    expect(sampleSeries(many, weeks)).toHaveLength(SAMPLE_SERIES_MAX);
  });

  it("**観測数は必ず 0**（実測と取り違えられる値を持たせない）", () => {
    const weeks = comingWeekStarts(SAMPLE_WEEKS, NOW);
    for (const s of sampleSeries(["SEO ツール"], weeks)) {
      expect(s.totalN).toBe(0);
      for (const p of s.points) {
        expect(p.n).toBe(0);
        expect(p.hits).toBe(0);
      }
    }
  });

  it("週の数だけ点を作り、率は 0〜1 に収まる", () => {
    const weeks = comingWeekStarts(SAMPLE_WEEKS, NOW);
    const [line] = sampleSeries(["SEO ツール"], weeks);
    expect(line.points.map((p) => p.weekStart)).toEqual(weeks);
    for (const p of line.points) {
      expect(p.rate).not.toBeNull();
      expect(p.rate as number).toBeGreaterThanOrEqual(0);
      expect(p.rate as number).toBeLessThanOrEqual(1);
    }
  });

  it("3 本は「上がる / 横ばい / まだ低い」で形が違う", () => {
    const weeks = comingWeekStarts(SAMPLE_WEEKS, NOW);
    const [up, flat, low] = sampleSeries(["a", "b", "c"], weeks);
    const first = (s: (typeof up)) => s.points[0].rate as number;
    const last = (s: (typeof up)) => s.points[s.points.length - 1].rate as number;
    expect(last(up)).toBeGreaterThan(first(up) + 0.2); // はっきり上がる
    expect(Math.abs(last(flat) - first(flat))).toBeLessThan(0.1); // 横ばい
    expect(last(low)).toBeLessThan(0.3); // まだ低い
  });

  it("何度呼んでも同じ（乱数を使わない）", () => {
    const weeks = comingWeekStarts(SAMPLE_WEEKS, NOW);
    expect(sampleSeries(["SEO ツール"], weeks)).toEqual(sampleSeries(["SEO ツール"], weeks));
  });

  it("週数が 4 でなくても足りない分は最後の値で伸ばす", () => {
    const [line] = sampleSeries(["a"], comingWeekStarts(6, NOW));
    expect(line.points).toHaveLength(6);
    expect(line.points[5].rate).toBe(line.points[3].rate);
  });
});

/* ───────────── ドメイン別の引用 / フィルタ（2026-09-22） ───────────── */

describe("domainCitations", () => {
  const brands = { own: ["sample-kobo.jp"], competitors: ["rival.co.jp"] };

  it("引用の多い順に数え、自社 / 競合 / 第三者を分ける", () => {
    const rows = [
      obs({ citedDomains: ["rival.co.jp", "note.com"] }),
      obs({ citedDomains: ["rival.co.jp"] }),
      obs({ citedDomains: ["sample-kobo.jp"] }),
    ];
    const out = domainCitations(rows, brands);
    expect(out.map((d) => d.domain)).toEqual(["rival.co.jp", "note.com", "sample-kobo.jp"]);
    expect(out[0]).toMatchObject({ count: 2, domainClass: "competitor" });
    expect(out[1]).toMatchObject({ count: 1, domainClass: "third_party" });
    expect(out[2]).toMatchObject({ count: 1, domainClass: "own" });
    // share は全引用数に対する割合（合計 4）
    expect(out[0].share).toBeCloseTo(0.5);
  });

  it("同じ観測の中の重複は 1 回として数える（同じ回答で 3 回リンクされても 1）", () => {
    const out = domainCitations([obs({ citedDomains: ["note.com", "note.com", "NOTE.com"] })]);
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(1);
  });

  it("サブドメインも自社として数える", () => {
    const out = domainCitations([obs({ citedDomains: ["shop.sample-kobo.jp"] })], brands);
    expect(out[0].domainClass).toBe("own");
  });

  it("引用が無ければ空", () => {
    expect(domainCitations([obs({ citedDomains: [] })])).toEqual([]);
    expect(domainCitations([])).toEqual([]);
  });

  it("件数を絞れる", () => {
    const rows = ["a.com", "b.com", "c.com"].map((d) => obs({ citedDomains: [d] }));
    expect(domainCitations(rows, { limit: 2 })).toHaveLength(2);
  });
});

describe("applyFilter", () => {
  const rows = [
    obs({ model: "chatgpt", tags: ["比較"], executedAt: "2026-09-15T03:00:00Z" }),
    obs({ model: "gemini", tags: ["比較"], executedAt: "2026-09-15T03:00:00Z" }),
    obs({ model: "chatgpt", tags: ["指名"], executedAt: "2026-09-15T03:00:00Z" }),
    obs({ model: "chatgpt", tags: ["比較"], executedAt: "2026-06-01T03:00:00Z" }),
  ];

  it("既定は 4 週ローリング（古いものが落ちる）", () => {
    expect(applyFilter(rows, {}, NOW)).toHaveLength(3);
  });

  it("期間・モデル・タグを重ねて当てられる", () => {
    expect(applyFilter(rows, { model: "chatgpt" }, NOW)).toHaveLength(2);
    expect(applyFilter(rows, { tag: "比較" }, NOW)).toHaveLength(2);
    expect(applyFilter(rows, { model: "chatgpt", tag: "比較" }, NOW)).toHaveLength(1);
  });

  it('"all" は絞らない', () => {
    expect(applyFilter(rows, { model: "all", tag: "all" }, NOW)).toHaveLength(3);
  });

  it("期間を短くすると観測が減る（画面で n を出す前提）", () => {
    // NOW = 2026-09-16。20 日前は 4 週には入るが 1 週間には入らない
    const spread = [obs({ executedAt: "2026-09-15T03:00:00Z" }), obs({ executedAt: "2026-08-27T03:00:00Z" })];
    expect(applyFilter(spread, { days: 28 }, NOW)).toHaveLength(2);
    expect(applyFilter(spread, { days: 7 }, NOW)).toHaveLength(1);
  });

  it("期間の選択肢に既定の 4 週が含まれる", () => {
    expect(PERIOD_OPTIONS.map((p) => p.days)).toContain(28);
  });
});
