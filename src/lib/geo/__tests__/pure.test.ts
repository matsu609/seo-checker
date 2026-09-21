import { afterEach, describe, expect, it } from "vitest";
import { canRun, consume, creditAction, creditCost, forecastStandardPlan, MONTHLY_CREDITS, needsReset, nextResetAt, resetMonthly } from "../credits";
import { cacheKey, matchesDomain, normalizeDomain, normalizedHash, normalizeText } from "../normalize";
import { costUsd, DEFAULT_UNIT_PRICES, toJpy, unitPrices, usdJpy, mentionsCostUsd } from "../pricing";
import { jstWeekdayIndex, NORMAL_PLAN, PRECISION_PLAN, precisionWarning, repeatsToday, runDayOffsetFor, weeklyTotal, weekStart } from "../schedule";
import { allowsPercent, compareRates, toBand, wilsonInterval } from "../stats";

const KEEP = { ...process.env };
afterEach(() => {
  process.env = { ...KEEP };
});

describe("単価と為替（§0.2 / §1.1）", () => {
  it("既定値は仕様書のとおり", () => {
    expect(DEFAULT_UNIT_PRICES).toEqual({
      rank: 0.002,
      aio: 0.0026,
      aiMode: 0.002,
      llmStandard: 0.0012,
      llmPriority: 0.0024,
      llmLive: 0.004,
      mentionsRow: 0.0011,
    });
  });

  it("環境変数で単価を上書きできる（コードに直書きしない）", () => {
    process.env.GEO_PRICE_LLM_STANDARD_USD = "0.002";
    expect(unitPrices().llmStandard).toBe(0.002);
  });

  it("為替も設定値。既定は 1USD=160 円", () => {
    expect(usdJpy()).toBe(160);
    process.env.GEO_USD_JPY = "170";
    expect(usdJpy()).toBe(170);
    expect(toJpy(1)).toBe(170);
  });

  it("Live は標準キューより高い（誤用すると 3.3 倍）", () => {
    const p = DEFAULT_UNIT_PRICES;
    expect(costUsd("llm", "standard", p)).toBe(0.0012);
    expect(costUsd("llm", "live", p)).toBe(0.004);
    expect(costUsd("llm", "live", p) / costUsd("llm", "standard", p)).toBeCloseTo(3.33, 1);
  });

  it("標準プランの月額原価は ¥3,000 枠に収まる（§2.1）", () => {
    const p = DEFAULT_UNIT_PRICES;
    const measure = 800 * p.rank + 200 * p.aio + 1080 * p.llmStandard + 420 * p.llmStandard;
    const generation = 1.0 + 1.5 + 2.0; // 抽出・週次・月次
    const infra = 5.0;
    expect(toJpy(measure + generation + infra, 160)).toBeLessThan(3000);
  });
});

describe("正規化とハッシュ（§7.1）", () => {
  it("全角半角・大文字小文字・空白・句読点の揺れを吸収する", () => {
    expect(normalizeText("ＳＥＯ　対策　ツール")).toBe("seo 対策 ツール");
    expect(normalizeText("SEO対策ツール、おすすめ")).toBe("seo対策ツール おすすめ");
    expect(normalizeText("  seo   ツール  ")).toBe("seo ツール");
  });

  it("揺れた 2 つの入力が同じハッシュになる（顧客間で共有できる）", async () => {
    const a = await normalizedHash("ＳＥＯツール　おすすめ");
    const b = await normalizedHash("seoツール おすすめ");
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });

  it("別の語は別のハッシュ", async () => {
    expect(await normalizedHash("seo ツール")).not.toBe(await normalizedHash("meo ツール"));
  });

  it("キャッシュの鍵はモデルとロケールを含む（混ぜない）", () => {
    expect(cacheKey("abc", "chatgpt", "ja")).not.toBe(cacheKey("abc", "gemini", "ja"));
    expect(cacheKey("abc", "chatgpt", "ja")).not.toBe(cacheKey("abc", "chatgpt", "en"));
  });

  it("ドメインは www を落とし、サブドメインも自社と見なす（§4.3）", () => {
    expect(normalizeDomain("https://www.Example.com/path")).toBe("example.com");
    expect(matchesDomain("blog.example.com", "example.com")).toBe(true);
    expect(matchesDomain("example.com", "example.com")).toBe(true);
    expect(matchesDomain("notexample.com", "example.com")).toBe(false);
    expect(matchesDomain("example.com.evil.net", "example.com")).toBe(false);
  });
});

describe("クレジット（§6）", () => {
  it("消費レートは仕様書のとおり", () => {
    expect(creditCost("rank")).toBe(0.5);
    expect(creditCost("llm_standard")).toBe(0.5);
    expect(creditCost("llm_live")).toBe(2);
    expect(creditCost("weekly_report")).toBe(30);
    expect(creditCost("monthly_analysis")).toBe(150);
  });

  it("種類とモードからアクションが決まる", () => {
    expect(creditAction("llm", "standard")).toBe("llm_standard");
    expect(creditAction("llm", "live")).toBe("llm_live");
    expect(creditAction("rank", "standard")).toBe("rank");
  });

  it("標準構成の消費見込みは約 1,620 で、残りがオンデマンド枠（§6.3）", () => {
    const f = forecastStandardPlan();
    // 順位 800 + AI Overviews 200 + AI モード 200（2026-09-21 に AI モードを追加）
    expect(f.rankAio).toBe(600);
    expect(f.llmStandard).toBe(540);
    expect(f.llmPrecision).toBe(210);
    expect(f.weeklyReport).toBe(120);
    expect(f.monthlyAnalysis).toBe(150);
    expect(f.total).toBe(1620);
    expect(f.remaining).toBe(380);
  });

  it("業界の地図（#127）は行数課金で、残高が尽きたら止まる（定期実行は止めない）", () => {
    expect(mentionsCostUsd(30)).toBeCloseTo(30 * 0.0011);
    expect(mentionsCostUsd(0)).toBe(0);
    expect(mentionsCostUsd(-5)).toBe(0);
    const empty = { balance: 0, granted: MONTHLY_CREDITS };
    expect(canRun(empty, "llm_mentions").allowed).toBe(false);
    expect(canRun(empty, "llm_standard").allowed).toBe(true);
    expect(canRun({ balance: 5, granted: MONTHLY_CREDITS }, "llm_mentions").allowed).toBe(true);
  });

  it("ソフトキャップ: 残高が尽きても定期実行は止めず、Live だけ止める（§6.1）", () => {
    const empty = { balance: 0, granted: MONTHLY_CREDITS };
    expect(canRun(empty, "llm_standard").allowed).toBe(true);
    expect(canRun(empty, "rank").allowed).toBe(true);
    expect(canRun(empty, "llm_live").allowed).toBe(false);
    expect(canRun(empty, "llm_live").reason).toContain("クレジットが足りません");
  });

  it("繰越なしで月次リセット", () => {
    expect(resetMonthly()).toEqual({ balance: 2000, granted: 2000 });
    const used = consume({ balance: 100, granted: 2000 }, "llm_live", 3);
    expect(used.balance).toBe(94);
    expect(needsReset(nextResetAt(new Date("2026-09-16T00:00:00Z")), new Date("2026-09-16T00:00:00Z"))).toBe(false);
    expect(needsReset("2026-09-01T00:00:00Z", new Date("2026-09-16T00:00:00Z"))).toBe(true);
  });
});

describe("反復の日次分散（§2.3 / §2.4）", () => {
  it("通常は月・水・金に 1 回ずつ（週 3）", () => {
    expect(weeklyTotal(NORMAL_PLAN)).toBe(3);
    expect(NORMAL_PLAN).toEqual([1, 0, 1, 0, 1, 0, 0]);
  });

  it("高精度は月〜金に 2 回ずつ（週 10）", () => {
    expect(weeklyTotal(PRECISION_PLAN)).toBe(10);
  });

  it("同じ週の反復を同じ日にまとめない", () => {
    const daysWithRuns = NORMAL_PLAN.filter((n) => n > 0).length;
    expect(daysWithRuns).toBe(3);
    expect(Math.max(...NORMAL_PLAN)).toBe(1);
  });

  it("JST の曜日で数える（月曜が 0）", () => {
    // 2026-09-14 は月曜
    expect(jstWeekdayIndex(new Date("2026-09-14T03:00:00Z"))).toBe(0);
    // UTC では日曜 23 時でも JST では月曜
    expect(jstWeekdayIndex(new Date("2026-09-13T23:00:00Z"))).toBe(0);
  });

  it("オフセットで顧客ごとに曜日をずらす（合計回数は変わらない）", () => {
    const monday = new Date("2026-09-14T03:00:00Z");
    expect(repeatsToday(NORMAL_PLAN, 0, monday)).toBe(1);
    expect(repeatsToday(NORMAL_PLAN, 1, monday)).toBe(0); // この顧客の「月曜」は火曜
    const tuesday = new Date("2026-09-15T03:00:00Z");
    expect(repeatsToday(NORMAL_PLAN, 1, tuesday)).toBe(1);

    // 1 週間の合計はオフセットによらず 3
    for (const offset of [0, 3, 6]) {
      let total = 0;
      for (let d = 0; d < 7; d += 1) {
        total += repeatsToday(NORMAL_PLAN, offset, new Date(`2026-09-${14 + d}T03:00:00Z`));
      }
      expect(total).toBe(3);
    }
  });

  it("オフセットは利用者ごとに決まる（毎回同じ）", () => {
    const a = runDayOffsetFor("user_abc");
    expect(a).toBe(runDayOffsetFor("user_abc"));
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(7);
  });

  it("指名プロンプトを高精度枠にしようとしたら警告する（§2.2）", () => {
    expect(precisionWarning(true)).toContain("指名プロンプト");
    expect(precisionWarning(false)).toBeNull();
  });

  it("週の開始は月曜", () => {
    expect(weekStart(new Date("2026-09-17T03:00:00Z"))).toBe("2026-09-14");
    expect(weekStart(new Date("2026-09-14T03:00:00Z"))).toBe("2026-09-14");
  });
});

describe("統計と表示（§5）", () => {
  it("Wilson 区間は 0% でも幅を持つ（Wald と違って潰れない）", () => {
    const ci = wilsonInterval(0, 12);
    expect(ci.low).toBe(0);
    expect(ci.high).toBeGreaterThan(0.2);
  });

  it("n=40 の 95%CI はおよそ ±15pt（§5.2）", () => {
    const ci = wilsonInterval(20, 40);
    const margin = (ci.high - ci.low) / 2;
    expect(margin).toBeGreaterThan(0.13);
    expect(margin).toBeLessThan(0.17);
  });

  it("n が増えると区間は狭くなる", () => {
    const small = wilsonInterval(6, 12);
    const large = wilsonInterval(150, 300);
    expect(large.high - large.low).toBeLessThan(small.high - small.low);
  });

  it("通常プロンプトは段階表示にまるめる（§5.1-3）", () => {
    expect(toBand(10, 12)).toBe("often");
    expect(toBand(5, 12)).toBe("sometimes");
    expect(toBand(1, 12)).toBe("rare");
    expect(toBand(0, 12)).toBe("none");
  });

  it("パーセント表示は n が十分なときだけ許す（§5.1-4）", () => {
    expect(allowsPercent(12)).toBe(false);
    expect(allowsPercent(40)).toBe(true);
  });

  it("n=3 同士の完全分離でも「差は読み取れない」と言う（§5.2）", () => {
    expect(compareRates({ successes: 0, total: 3 }, { successes: 3, total: 3 })).toBe("unclear");
  });

  it("n=40 規模で大きく動いたときだけ変化を認める", () => {
    expect(compareRates({ successes: 4, total: 40 }, { successes: 32, total: 40 })).toBe("large-up");
    expect(compareRates({ successes: 32, total: 40 }, { successes: 4, total: 40 })).toBe("large-down");
    expect(compareRates({ successes: 18, total: 40 }, { successes: 22, total: 40 })).toBe("unclear");
  });
});
