import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { palette } from "@/lib/ui/palette";
import { PERCENT_DISPLAY_MIN_N } from "@/lib/geo/stats";
import { TargetBars, type TargetBarsProps } from "../TargetBars";
import { defaultSelection, MAX_SERIES, TrendChart, weekLabel, type TrendChartProps } from "../TrendChart";
import type { WeeklySeries } from "@/lib/geo/aggregate";
import type { TargetRow } from "../client";

function row(over: Partial<TargetRow> = {}): TargetRow {
  return {
    targetId: "p1",
    label: "おすすめの SEO ツールは？",
    n: 12,
    hits: 9,
    rate: 0.75,
    ciLow: 0.468,
    ciHigh: 0.911,
    band: "often",
    spread: 0.443,
    perModel: [
      { model: "chatgpt", n: 6, hits: 5, rate: 5 / 6 },
      { model: "gemini", n: 6, hits: 4, rate: 4 / 6 },
    ],
    ...over,
  };
}

function render(rows: TargetRow[], over: Partial<TargetBarsProps> = {}): string {
  return renderToStaticMarkup(
    createElement(TargetBars, {
      rows,
      title: "プロンプトごとの出現率",
      description: "棒が平均、帯がありうる範囲です。",
      cadence: "週 3 回",
      emptyText: "まだ計測結果がありません。",
      ...over,
    }),
  );
}

describe("TargetBars", () => {
  it("行が無いときは案内だけを出し、グラフは描かない", () => {
    const html = render([]);
    expect(html).toContain("まだ計測結果がありません。");
    expect(html).not.toContain("<svg");
  });

  it("棒（点推定）と帯（信頼区間）を必ず両方描く", () => {
    const html = render([row()]);
    const svgs = html.match(/<svg[^>]*>/g) ?? [];
    expect(svgs.length).toBe(1);
    // チャートのハードルール（ui-notes §2）
    for (const tag of svgs) {
      expect(tag).toMatch(/ width="\d+(\.\d+)?"/);
      expect(tag).toMatch(/ viewBox="0 0 \d+(\.\d+)? \d+(\.\d+)?"/);
      expect(tag).toMatch(/role="img"/);
    }
    expect(html).not.toMatch(/var\(--/);
    // 帯（chart[2]）と棒（chart[0]）の両方の色が出ている = 幅を隠していない
    expect(html).toContain(palette.chart[2]);
    expect(html).toContain(palette.chart[0]);
    expect(html).toContain("ありうる範囲（95% 信頼区間）");
  });

  it("観測が足りない行は別の色にし、参考値だと断る", () => {
    const html = render([row({ n: 4, hits: 3, rate: 0.75 })]);
    expect(html).toContain(palette.chart[4]);
    expect(html).toContain(`観測が ${PERCENT_DISPLAY_MIN_N} 回に満たない 1 行`);
  });

  it("観測が十分なら参考値の断りを出さない", () => {
    const html = render([row({ n: 40, hits: 30 })]);
    expect(html).not.toContain("参考値");
    expect(html).toContain(palette.chart[0]);
  });

  it("4 週の回数と、帯の読み方を必ず添える", () => {
    const html = render([row()], { cadence: "週 1 回（月曜）なので 4 週で 4 回" });
    expect(html).toContain("週 1 回（月曜）なので 4 週で 4 回");
    expect(html).toContain("帯が重なっている 2 行は、順位が入れ替わっていても差は読み取れません");
    // 「有意差」という言葉は使わない（仕様書 §5.1-5）
    expect(html).not.toContain("有意差");
  });

  it("モデルの絞り込みは指定したときだけ出す", () => {
    expect(render([row()])).not.toContain("すべてのモデル");
    expect(render([row()], { modelFilter: true })).toContain("すべてのモデル");
  });

  it("1 行あたりの分子・分母を出す（率だけを見せない）", () => {
    const html = render([row()]);
    expect(html).toContain("12 回中 9 回");
  });
});

/* ───────────── 推移の折れ線（利用者の指示 2026-09-21） ───────────── */

const WEEKS = ["2026-08-24", "2026-08-31", "2026-09-07", "2026-09-14"];

function serie(over: Partial<WeeklySeries> = {}): WeeklySeries {
  return {
    targetId: "k1",
    label: "SEO ツール",
    points: [
      { weekStart: WEEKS[0], n: 1, hits: 0, rate: 0 },
      { weekStart: WEEKS[1], n: 1, hits: 1, rate: 1 },
      { weekStart: WEEKS[2], n: 0, hits: 0, rate: null },
      { weekStart: WEEKS[3], n: 2, hits: 1, rate: 0.5 },
    ],
    latest: 0.5,
    totalN: 4,
    ...over,
  };
}

function renderTrend(series: WeeklySeries[], over: Partial<TrendChartProps> = {}): string {
  return renderToStaticMarkup(
    createElement(TrendChart, {
      weeks: WEEKS,
      series,
      title: "キーワードごとの推移（週ごと）",
      description: "上がっているか下がっているかを追うためのグラフです。",
      emptyText: "まだ計測結果がありません。",
      unit: "キーワード",
      ...over,
    }),
  );
}

describe("TrendChart", () => {
  it("行が無いときは案内だけを出し、グラフは描かない", () => {
    const html = renderTrend([]);
    expect(html).toContain("まだ計測結果がありません。");
    expect(html).not.toContain("<svg");
  });

  it("週の目盛りを短く出す", () => {
    expect(weekLabel("2026-09-14")).toBe("9/14");
    expect(weekLabel("こわれた値")).toBe("こわれた値");
    expect(renderTrend([serie()])).toContain("9/14");
  });

  it("未計測の週は 0% ではなく線を切り、その旨を書く", () => {
    const html = renderTrend([serie()]);
    // 表の欄は「未計測」（0% ではない）
    expect(html).toContain("未計測");
    expect(html).toContain("その週に計測が無かった区間です（0% ではありません）");
  });

  it("欠測が無いときは切れ目の断り書きを出さない", () => {
    const filled = serie({ points: serie().points.map((p) => ({ ...p, n: 1, hits: 1, rate: 1 })) });
    expect(renderTrend([filled])).not.toContain("その週に計測が無かった区間です");
  });

  it("既定で選ぶのは先頭 5 本まで、同時に描けるのは 6 本まで", () => {
    const many = Array.from({ length: 9 }, (_, i) => serie({ targetId: `k${i}`, label: `語${i}` }));
    expect(defaultSelection(many)).toHaveLength(5);
    expect(MAX_SERIES).toBe(6);
    const html = renderTrend(many);
    // 選択ボタンは全件、線は既定の 5 本だけ
    for (const s of many) expect(html).toContain(s.label);
    expect(html).toContain("5 / 6 本");
  });

  it("1 週ぶんの読み方を必ず添える（水準ではなく傾きのグラフ）", () => {
    const html = renderTrend([serie()]);
    expect(html).toContain("傾きを見るためのグラフ");
    expect(html).not.toContain("有意差");
  });

  it("y 軸は 0〜100% に固定する（系列ごとに伸び縮みさせない）", () => {
    const html = renderTrend([serie()]);
    expect(html).toContain("100%");
    expect(html).toContain("0%");
  });
});
