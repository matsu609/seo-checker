/**
 * MEO の見本データ（Google マップ / 口コミ / 投稿の 4 タブで使う）。
 *
 * 見本は実測と取り違えられないことが最優先なので、
 * ①日付が未来 ②値が「ありえる範囲」 ③線の本数が読める数、を固定する。
 */
import { describe, expect, it } from "vitest";
import {
  SAMPLE_MAP_KEYWORDS,
  SAMPLE_POINTS,
  SAMPLE_RATING_DISTRIBUTION,
  SAMPLE_REPLY_MIX,
  SAMPLE_SERIES_MAX,
  sampleCompare,
  sampleInsightTrend,
  sampleMapRankTrend,
  samplePostWeeks,
  sampleScoreTrend,
  sampleSurveyWeeks,
} from "../meo";

const NOW = new Date("2026-09-22T03:00:00Z"); // 日本時間の火曜

describe("診断スコアの推移", () => {
  it("総合 + 4 カテゴリの 5 本で、点の数がそろう", () => {
    const { dates, series } = sampleScoreTrend(SAMPLE_POINTS, NOW);
    expect(dates).toHaveLength(SAMPLE_POINTS);
    expect(series.map((s) => s.label)).toEqual(["総合", "基本情報", "投稿", "写真", "レビュー"]);
    for (const s of series) expect(s.values).toHaveLength(SAMPLE_POINTS);
  });

  it("点数は 0〜100 に収まる", () => {
    for (const s of sampleScoreTrend(SAMPLE_POINTS, NOW).series) {
      for (const v of s.values) {
        expect(v).not.toBeNull();
        expect(v as number).toBeGreaterThanOrEqual(0);
        expect(v as number).toBeLessThanOrEqual(100);
      }
    }
  });

  it("横軸はこれからの月曜（過去に描かない）", () => {
    for (const d of sampleScoreTrend(SAMPLE_POINTS, NOW).dates) expect(d >= "2026-09-22").toBe(true);
  });

  it("点の数を増やしても足りない分は最後の値を伸ばす", () => {
    const { series } = sampleScoreTrend(6, NOW);
    const overall = series[0]!.values;
    expect(overall).toHaveLength(6);
    expect(overall[5]).toBe(overall[3]);
  });
});

describe("マップ検索順位の推移", () => {
  it("登録済みのキーワードがあればその言葉で描く", () => {
    const { series } = sampleMapRankTrend(["渋谷 美容室", "渋谷 カット"], SAMPLE_POINTS, NOW);
    expect(series.map((s) => s.label)).toEqual(["渋谷 美容室", "渋谷 カット"]);
  });

  it("登録が無ければ例の言葉を使い、本数の上限を超えない", () => {
    const { series } = sampleMapRankTrend([], SAMPLE_POINTS, NOW);
    expect(series.map((s) => s.label)).toEqual([...SAMPLE_MAP_KEYWORDS].slice(0, SAMPLE_SERIES_MAX));
    expect(series.length).toBeLessThanOrEqual(SAMPLE_SERIES_MAX);
  });

  it("多すぎるキーワードは切り詰める", () => {
    const many = ["a", "b", "c", "d", "e"];
    expect(sampleMapRankTrend(many, SAMPLE_POINTS, NOW).series).toHaveLength(SAMPLE_SERIES_MAX);
  });

  it("順位は 1〜20 位か圏外（null）", () => {
    for (const s of sampleMapRankTrend([], SAMPLE_POINTS, NOW).series) {
      for (const v of s.values) {
        if (v === null) continue;
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(20);
      }
    }
  });

  it("圏外から入ってくる線が 1 本ある（線が切れる見え方を見せる）", () => {
    const series = sampleMapRankTrend([], SAMPLE_POINTS, NOW).series;
    expect(series.some((s) => s.values.includes(null))).toBe(true);
  });
});

describe("見られ方（月次）", () => {
  it("これからの月が並び、表示回数が行動より大きい", () => {
    const { months, series } = sampleInsightTrend(6, NOW);
    expect(months[0]).toBe("2026-09");
    expect(months).toHaveLength(6);
    const impressions = series.find((s) => s.id === "sample-impressions")!;
    for (const other of series.filter((s) => s.id !== "sample-impressions")) {
      expect(impressions.values[0] as number).toBeGreaterThan(other.values[0] as number);
    }
  });
});

describe("競合との比較", () => {
  it("自社は 1 件だけで、店名があればそれを使う", () => {
    const rows = sampleCompare("テスト店");
    expect(rows.filter((r) => r.own)).toHaveLength(1);
    expect(rows.find((r) => r.own)?.label).toBe("テスト店（自社）");
  });

  it("店名が無くても描ける", () => {
    expect(sampleCompare(null).find((r) => r.own)?.label).toBe("例: 自社");
  });
});

describe("口コミ・投稿", () => {
  it("アンケートの押下数は回答数を超えない", () => {
    const { weeks, answers, clicks } = sampleSurveyWeeks(SAMPLE_POINTS, NOW);
    expect(weeks).toHaveLength(SAMPLE_POINTS);
    answers.forEach((a, i) => expect(clicks[i]!).toBeLessThanOrEqual(a));
  });

  it("評価の分布に低評価が含まれる（低評価ゼロの見本にしない）", () => {
    expect(SAMPLE_RATING_DISTRIBUTION[0] + SAMPLE_RATING_DISTRIBUTION[1]).toBeGreaterThan(0);
    expect(SAMPLE_RATING_DISTRIBUTION).toHaveLength(5);
  });

  it("返信の見本には未返信が残っている（そこが直す対象だから）", () => {
    expect(SAMPLE_REPLY_MIX.pending).toBeGreaterThan(0);
    expect(SAMPLE_REPLY_MIX.replied).toBeGreaterThan(0);
  });

  it("投稿は週 1 本以上を続けた形になる", () => {
    const { weeks, published } = samplePostWeeks(SAMPLE_POINTS, NOW);
    expect(weeks).toHaveLength(SAMPLE_POINTS);
    for (const n of published) expect(n).toBeGreaterThanOrEqual(1);
  });
});
