import { describe, expect, it } from "vitest";
import { formatNumericDateTime } from "../date";

describe("formatNumericDateTime", () => {
  it("「2026/09/06 14:05」の形（時は 2 桁）", () => {
    const d = new Date(2026, 0, 2, 0, 7);
    expect(formatNumericDateTime(d.toISOString())).toBe("2026/01/02 00:07");
    expect(formatNumericDateTime(new Date(2026, 11, 31, 23, 59).toISOString())).toBe("2026/12/31 23:59");
  });

  it("読めない値は入力のまま、または指定の文字", () => {
    expect(formatNumericDateTime("not-a-date")).toBe("not-a-date");
    expect(formatNumericDateTime("not-a-date", "—")).toBe("—");
    expect(formatNumericDateTime("")).toBe("");
  });
});
