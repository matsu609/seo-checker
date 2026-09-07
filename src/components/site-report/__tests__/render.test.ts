/**
 * 複合グラフ（§18.2）の SVG。チャートのハードルール（ui-notes §2）と、
 * 「未計測の日は線を切る」「ゼロのグラフを出さない」を確かめる。
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AVERAGE_RANK_COLOR, FINDABILITY_COLOR } from "@/lib/site-report/channels";
import { palette } from "@/lib/ui/palette";
import { FINDABILITY_MAX, TrafficChart } from "../TrafficChart";

const SERIES = [
  { label: "自然検索", color: palette.accent, values: [100, 120, 90] },
  { label: "ノーリファラー", color: palette.chart[1], values: [40, 30, 20] },
];

function chart(props: Partial<Parameters<typeof TrafficChart>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(TrafficChart, {
      labels: ["9/1", "9/2", "9/3"],
      series: SERIES,
      averageRank: [8, null, 6],
      findability: [20, null, 30],
      worstRank: 101,
      metricLabel: "セッション数",
      ...props,
    }),
  );
}

describe("TrafficChart", () => {
  it("width / height / viewBox / role / aria-label / title を持ち、色は hex 直書き", () => {
    const html = chart();
    const tag = (html.match(/<svg[^>]*>/g) ?? [])[0];
    expect(tag).toMatch(/ width="720"/);
    expect(tag).toMatch(/ height="280"/);
    expect(tag).toMatch(/ viewBox="0 0 720 280"/);
    expect(tag).toMatch(/role="img"/);
    expect(tag).toMatch(/aria-label="[^"]+"/);
    expect(html).toContain("<title>");
    expect(html).not.toMatch(/var\(--/);
    for (const c of html.match(/(?:fill|stroke)="([^"]+)"/g) ?? []) {
      expect(c).toMatch(/="(#[0-9a-f]{6}|none)"/);
    }
  });

  it("チャネルの積み上げ棒を系列の色で描く", () => {
    const html = chart();
    expect(html).toContain(`fill="${palette.accent}"`);
    expect(html).toContain(`fill="${palette.chart[1]}"`);
  });

  it("未計測の日で折れ線を切る（前の値を引き継がない）", () => {
    const html = chart();
    const rankLines = html.match(new RegExp(`stroke="${AVERAGE_RANK_COLOR}"`, "g")) ?? [];
    // 折れ線 2 本（9/1 と 9/3 が別セグメント）＋ 点 2 つ
    expect(html).toContain(`stroke="${AVERAGE_RANK_COLOR}"`);
    expect(rankLines.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain(`stroke="${FINDABILITY_COLOR}"`);
    // 3 点すべて繋いだ 1 本の polyline にはならない
    expect(html).not.toMatch(/points="[^"]*,[^"]*,[^"]*,[^"]*,[^"]*"/);
  });

  it("右軸は順位（1 位が上、圏外の設定値が下）", () => {
    const html = chart();
    expect(html).toContain(">1位<");
    expect(html).toContain(">101位<");
    expect(chart({ worstRank: 100 })).toContain(">100位<");
  });

  it("ファインダビリティの上端は CTR カーブ由来の理論上限（0〜100 に貼り付けない）", () => {
    // 全キーワードが 1 位でもスコアは 28.0 が上限。0〜100 で描くと下から 1/4 に潰れる
    expect(FINDABILITY_MAX).toBeCloseTo(28, 5);
    const html = chart({ averageRank: [null, null, null], findability: [FINDABILITY_MAX, FINDABILITY_MAX, FINDABILITY_MAX] });
    const line = (html.match(new RegExp(`<polyline points="([^"]+)"[^>]*stroke="${FINDABILITY_COLOR}"`)) ??
      [])[1];
    expect(line).toBeDefined();
    // 上端（PAD_T = 12）に乗る
    for (const point of (line ?? "").split(" ")) expect(point.split(",")[1]).toBe("12");
  });

  it("順位を 1 度も計測していなければ折れ線を描かない（0 のグラフにしない）", () => {
    const html = chart({ averageRank: [null, null, null], findability: [null, null, null] });
    expect(html).not.toContain(`stroke="${AVERAGE_RANK_COLOR}"`);
    expect(html).not.toContain(`stroke="${FINDABILITY_COLOR}"`);
    expect(html).toContain(`fill="${palette.accent}"`);
  });

  it("データが無ければグラフではなく文言を出す", () => {
    const html = chart({ labels: [], series: [], averageRank: [], findability: [] });
    expect(html).not.toContain("<svg");
    expect(html).toContain("表示できるデータがありません");
  });
});
