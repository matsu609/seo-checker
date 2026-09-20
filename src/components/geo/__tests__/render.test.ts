import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { palette } from "@/lib/ui/palette";
import { PERCENT_DISPLAY_MIN_N } from "@/lib/geo/stats";
import { TargetBars, type TargetBarsProps } from "../TargetBars";
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
