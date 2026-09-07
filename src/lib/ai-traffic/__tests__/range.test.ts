/**
 * 期間の解決（プリセット / カスタム）。純関数なのでネットワークにも localStorage にも出ない。
 */
import { describe, expect, it } from "vitest";
import { DEFAULT_AI_TRAFFIC_SETTINGS, MAX_RANGE_DAYS, resolveRange, type AiTrafficSettings } from "../store";

const TODAY = new Date("2026-09-07T09:00:00.000Z");

function settings(patch: Partial<AiTrafficSettings> = {}): AiTrafficSettings {
  return { ...DEFAULT_AI_TRAFFIC_SETTINGS, ...patch };
}

describe("resolveRange", () => {
  it("プリセットは昨日を終端にした直近 N 日", () => {
    expect(resolveRange(settings({ days: 7 }), TODAY)).toEqual({
      range: { startDate: "2026-08-31", endDate: "2026-09-06" },
      error: null,
    });
    expect(resolveRange(settings({ days: 28 }), TODAY).range).toEqual({
      startDate: "2026-08-10",
      endDate: "2026-09-06",
    });
  });

  it("days が 0 のときは指定した期間を使う", () => {
    const result = resolveRange(settings({ days: 0, startDate: "2026-01-01", endDate: "2026-01-31" }), TODAY);
    expect(result).toEqual({ range: { startDate: "2026-01-01", endDate: "2026-01-31" }, error: null });
  });

  it("開始日と終了日が同じ日でも 1 日として通る", () => {
    const result = resolveRange(settings({ days: 0, startDate: "2026-01-01", endDate: "2026-01-01" }), TODAY);
    expect(result.error).toBeNull();
    expect(result.range).toEqual({ startDate: "2026-01-01", endDate: "2026-01-01" });
  });

  it("日付の形式が違えば理由を返す", () => {
    for (const patch of [
      { startDate: "", endDate: "" },
      { startDate: "2026/01/01", endDate: "2026-01-31" },
      { startDate: "2026-01-01", endDate: "2026-02-30" },
    ]) {
      const result = resolveRange(settings({ days: 0, ...patch }), TODAY);
      expect(result.range).toBeNull();
      expect(result.error).toContain("YYYY-MM-DD");
    }
  });

  it("終了日が開始日より前なら理由を返す", () => {
    const result = resolveRange(settings({ days: 0, startDate: "2026-01-31", endDate: "2026-01-01" }), TODAY);
    expect(result.range).toBeNull();
    expect(result.error).toContain("終了日");
  });

  it("上限を超える期間は理由を返す", () => {
    const result = resolveRange(settings({ days: 0, startDate: "2024-01-01", endDate: "2026-01-01" }), TODAY);
    expect(result.range).toBeNull();
    expect(result.error).toContain(String(MAX_RANGE_DAYS));
  });
});
