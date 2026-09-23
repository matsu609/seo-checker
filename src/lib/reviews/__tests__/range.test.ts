/**
 * 回答の一覧の期間指定（2026-09-23）。存在しない日付は 500 ではなく 400。
 */
import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/reviews/responses/route";
import { jstDayStartIso } from "../range";

describe("jstDayStartIso", () => {
  it("日本時間の 0:00 を ISO で返す。to 用に日をずらせる", () => {
    expect(jstDayStartIso("2026-09-01")).toBe("2026-08-31T15:00:00.000Z");
    expect(jstDayStartIso("2026-09-30", 1)).toBe("2026-09-30T15:00:00.000Z");
    expect(jstDayStartIso("2026-12-31", 1)).toBe("2026-12-31T15:00:00.000Z");
  });

  it("存在しない日付・形の違うものは null（以前は 13 月で RangeError、2 月 30 日は 3 月 2 日扱い）", () => {
    for (const bad of ["2026-13-01", "2026-00-10", "2026-02-30", "2026-9-1", "2026-09-01T00:00", ""]) {
      expect(jstDayStartIso(bad)).toBeNull();
    }
    expect(jstDayStartIso("2028-02-29")).toBe("2028-02-28T15:00:00.000Z");
  });
});

describe("GET /api/reviews/responses", () => {
  const url = (q: string) => new Request(`http://localhost/api/reviews/responses?formId=0b2f0b8e-0000-4000-8000-000000000001&${q}`);

  it("13 月は 500 ではなく 400", async () => {
    const res = await GET(url("from=2026-13-01"));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("開始日の形式が正しくありません");
    const res2 = await GET(url("to=2026-02-30"));
    expect(res2.status).toBe(400);
    expect(((await res2.json()) as { error: string }).error).toBe("終了日の形式が正しくありません");
  });
});
