/** 数値テスト（docs/dev/diagnosis-rules-spec.md §23） */
import { describe, expect, it } from "vitest";
import {
  brandClickShare,
  changeOf,
  ctrOf,
  daysBetween,
  directionOf,
  formatChange,
  median,
  positionDirection,
  queryCoverage,
  shareOf,
  toNumber,
} from "../metrics";
import { DEFAULT_THRESHOLDS, thresholdsForGoal } from "../thresholds";

describe("CTR", () => {
  it("クリック ÷ 表示回数で出す", () => {
    expect(ctrOf(50, 1000)).toBeCloseTo(0.05);
  });

  it("行別 CTR の単純平均にはならない", () => {
    // 表示 1 回で 1 クリック（CTR 100%）と、表示 999 回で 0 クリックの 2 行。
    // 単純平均なら 50% になるが、正しくは 1 / 1000 = 0.1%
    const clicks = 1 + 0;
    const impressions = 1 + 999;
    expect(ctrOf(clicks, impressions)).toBeCloseTo(0.001);
  });

  it("表示回数 0 でゼロ除算しない", () => {
    expect(ctrOf(0, 0)).toBe(0);
  });
});

describe("増減率", () => {
  it("（当期 - 前期）÷ 前期", () => {
    expect(changeOf(120, 100).rate).toBeCloseTo(0.2);
  });

  it("前期 0 のときは増減率を出さず「新規発生」にする", () => {
    const c = changeOf(50, 0);
    expect(c.rate).toBeNull();
    expect(c.isNew).toBe(true);
    expect(formatChange(c)).toContain("新規発生");
  });

  it("前期も当期も 0 なら新規ではない", () => {
    const c = changeOf(0, 0);
    expect(c.rate).toBeNull();
    expect(c.isNew).toBe(false);
  });
});

describe("増減の向き", () => {
  const t = DEFAULT_THRESHOLDS;

  it("±5% 以内は横ばい", () => {
    expect(directionOf(changeOf(103, 100), t)).toBe("flat");
  });

  it("+20% 以上は増加", () => {
    expect(directionOf(changeOf(130, 100), t)).toBe("up");
  });

  it("-20% 以下は減少", () => {
    expect(directionOf(changeOf(70, 100), t)).toBe("down");
  });

  it("横ばいでも増加でもない中間は、どちらとも言えないままにする", () => {
    expect(directionOf(changeOf(110, 100), t)).toBe("unknown");
  });
});

describe("掲載順位", () => {
  it("数が小さくなったら改善", () => {
    expect(positionDirection(5, 9, 2)).toBe("improved");
  });

  it("動きが閾値未満なら横ばい", () => {
    expect(positionDirection(9, 10, 2)).toBe("flat");
  });
});

describe("率の計算", () => {
  it("分母が 0 なら null（0% ではない）", () => {
    expect(shareOf(3, 0)).toBeNull();
    expect(queryCoverage(100, 0)).toBeNull();
    expect(brandClickShare(50, 0)).toBeNull();
  });

  it("クエリ取得率はクエリのクリック合計 ÷ 全体のクリック", () => {
    expect(queryCoverage(650, 1000)).toBeCloseTo(0.65);
  });
});

describe("パーセント文字列の数値化", () => {
  it("末尾の % を 0〜1 に直す", () => {
    expect(toNumber("12.3%")).toBeCloseTo(0.123);
  });

  it("桁区切りのカンマを外す", () => {
    expect(toNumber("1,234")).toBe(1234);
  });

  it("数にできない値は null", () => {
    expect(toNumber("－")).toBeNull();
    expect(toNumber("")).toBeNull();
  });
});

describe("期間", () => {
  it("両端を含む日数を返す", () => {
    expect(daysBetween("2026-08-01", "2026-08-28")).toBe(28);
  });

  it("不正な日付なら 0", () => {
    expect(daysBetween("", "2026-08-28")).toBe(0);
  });
});

describe("中央値", () => {
  it("奇数件", () => {
    expect(median([1, 5, 3])).toBe(3);
  });
  it("偶数件は中央 2 つの平均", () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
  it("空なら 0", () => {
    expect(median([])).toBe(0);
  });
});

describe("業種プリセット", () => {
  it("目的に応じて閾値を上書きする", () => {
    expect(thresholdsForGoal("media").minimumTotalImpressions).toBeGreaterThan(DEFAULT_THRESHOLDS.minimumTotalImpressions);
    expect(thresholdsForGoal("ec").highHomepageClickShare).toBeLessThan(DEFAULT_THRESHOLDS.highHomepageClickShare);
  });

  it("上書きの無い目的は既定値のまま", () => {
    expect(thresholdsForGoal("other")).toEqual(DEFAULT_THRESHOLDS);
  });

  it("明示した上書きがプリセットより優先される", () => {
    expect(thresholdsForGoal("media", { minimumTotalImpressions: 10 }).minimumTotalImpressions).toBe(10);
  });
});
