/**
 * 精密診断の入力フォームの固定枠。古い保存値（文字列）も読めることを固定する。
 */
import { describe, expect, it } from "vitest";
import { MAX_COMPETITORS, MAX_KEYWORDS } from "../input";
import { filledSlots, splitLines, toSlots, withSlot } from "../store";

describe("固定枠", () => {
  it("配列は枠数に揃え、文字列（旧形式）は改行で分けて枠に入れる", () => {
    expect(toSlots(["a", "b"], MAX_KEYWORDS)).toEqual(["a", "b", "", "", ""]);
    expect(toSlots("a\nb, c", MAX_KEYWORDS)).toEqual(["a", "b", "c", "", ""]);
    expect(toSlots(undefined, MAX_COMPETITORS)).toEqual(["", ""]);
    expect(toSlots(["1", "2", "3", "4", "5", "6"], MAX_KEYWORDS)).toHaveLength(5);
  });

  it("枠の位置を動かさずに書き換え、送るときだけ空を除く", () => {
    const slots = withSlot(["a", "", "", "", ""], 2, "c", MAX_KEYWORDS);
    expect(slots).toEqual(["a", "", "c", "", ""]);
    expect(filledSlots(slots, MAX_KEYWORDS)).toEqual(["a", "c"]);
    expect(filledSlots(["a", " a ", "b"], MAX_KEYWORDS)).toEqual(["a", "b"]);
  });

  it("splitLines は改行・カンマ・読点で分け、重複を除く", () => {
    expect(splitLines("a\nb、b,c", 10)).toEqual(["a", "b", "c"]);
  });
});
