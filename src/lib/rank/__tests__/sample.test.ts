/**
 * 計測前のイメージ（破線グラフ）のデータ（利用者の指示 2026-09-22
 * 「最初のうちはデータがないので、デモデータの破線グラフで表示させてください」）。
 *
 * いちばん大事なのは **日付が未来であること**。過去の日付で描くと、
 * 見本が「もう測った数字」に見えてしまう。
 */
import { describe, expect, it } from "vitest";
import {
  comingMeasureDates,
  SAMPLE_FALLBACK_LABELS,
  SAMPLE_POINTS,
  SAMPLE_SERIES_MAX,
  sampleRankSeries,
  sampleYMax,
} from "../sample";

describe("これから計測する日（日本時間。2026-09-23 にローカル時刻をやめた）", () => {
  it("次の火曜から 1 週間ごとに並ぶ", () => {
    // 2026-09-22（火）4:00 JST。5:00 の自動計測の前なので当日から数える
    expect(comingMeasureDates(4, new Date("2026-09-21T19:00:00Z"))).toEqual(["2026-09-22", "2026-09-29", "2026-10-06", "2026-10-13"]);
    // 同じ火曜でも 5:00 を過ぎたらもう測った日。次の火曜から
    expect(comingMeasureDates(2, new Date("2026-09-22T03:00:00Z"))).toEqual(["2026-09-29", "2026-10-06"]);
    // 水曜なら次の火曜から
    expect(comingMeasureDates(2, new Date("2026-09-23T03:00:00Z"))).toEqual(["2026-09-29", "2026-10-06"]);
    // 月曜なら翌日
    expect(comingMeasureDates(1, new Date("2026-09-21T03:00:00Z"))).toEqual(["2026-09-22"]);
  });

  it("サーバー（UTC）の日付ではなく日本の日付で数える（hydration のずれを起こさない）", () => {
    // UTC では 9/21（月）23:00 だが、日本では 9/22（火）8:00 = 自動計測のあと
    expect(comingMeasureDates(1, new Date("2026-09-21T23:00:00Z"))).toEqual(["2026-09-29"]);
  });

  it("必ず今日より後の計測日になる（見本を過去に描かない）", () => {
    const now = new Date("2026-09-23T03:00:00Z");
    for (const d of comingMeasureDates(SAMPLE_POINTS, now)) {
      expect(d > "2026-09-23").toBe(true);
    }
  });

  it("月をまたいでも正しく進む", () => {
    // 2026-12-29（火）4:00 JST
    expect(comingMeasureDates(3, new Date("2026-12-28T19:00:00Z"))).toEqual(["2026-12-29", "2027-01-05", "2027-01-12"]);
  });
});

describe("見本の系列", () => {
  it("登録済みのキーワードがあれば、その言葉で描く", () => {
    const series = sampleRankSeries(["港区 整体", "肩こり 整体", "整体 料金", "4 つ目は出さない"]);
    expect(series).toHaveLength(SAMPLE_SERIES_MAX);
    expect(series.map((s) => s.label)).toEqual(["港区 整体", "肩こり 整体", "整体 料金"]);
  });

  it("登録が無ければ例の言葉を使う", () => {
    expect(sampleRankSeries([]).map((s) => s.label)).toEqual([...SAMPLE_FALLBACK_LABELS]);
  });

  it("上がる線・横ばいの線・圏外から入る線の 3 本", () => {
    const [up, flat, fromOut] = sampleRankSeries([]);
    // 上がる = 数字が小さくなる（1 位が上）
    expect(up.values[0]).toBeGreaterThan(up.values[SAMPLE_POINTS - 1] as number);
    expect(flat.values.every((v) => v !== null)).toBe(true);
    // 圏外は null（線が切れる）
    expect(fromOut.values[0]).toBeNull();
    expect(fromOut.values[SAMPLE_POINTS - 1]).not.toBeNull();
  });

  it("点の数を変えても足りない分は最後の値を伸ばす", () => {
    const [up] = sampleRankSeries([], 6);
    expect(up.values).toHaveLength(6);
    expect(up.values[5]).toBe(up.values[3]);
  });

  it("縦軸の下端は、いちばん悪い順位以上（最低でも 10 位）", () => {
    expect(sampleYMax(sampleRankSeries([]))).toBe(44);
    expect(sampleYMax([{ id: "a", label: "a", values: [3, 4] }])).toBe(10);
  });
});
