import { describe, expect, it } from "vitest";
import { palette } from "../palette";
import { ratingBands } from "../rating-bands";

describe("ratingBands", () => {
  it("★5 から ★1 の順に並べ、1〜5 の件数を対応させる", () => {
    const bands = ratingBands([1, 2, 3, 4, 5]);
    expect(bands.map((b) => b.label)).toEqual(["★5", "★4", "★3", "★2", "★1"]);
    expect(bands.map((b) => b.count)).toEqual([5, 4, 3, 2, 1]);
  });

  it("低評価（★1・★2）だけ色を変える", () => {
    const bands = ratingBands([0, 0, 0, 0, 0]);
    expect(bands.map((b) => b.color)).toEqual([palette.chart[0], palette.chart[0], palette.chart[0], palette.chart[3], palette.chart[3]]);
  });

  it("足りない件数は 0", () => {
    expect(ratingBands([7]).map((b) => b.count)).toEqual([0, 0, 0, 0, 7]);
  });
});
