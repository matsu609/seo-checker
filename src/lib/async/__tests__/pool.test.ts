import { describe, expect, it } from "vitest";
import { runPool } from "../pool";

describe("runPool（順位計測から移した。2026-09-23）", () => {
  it("同時実行数を守り、入力順で結果を返す", async () => {
    let running = 0;
    let peak = 0;
    const items = Array.from({ length: 7 }, (_, i) => i);
    const out = await runPool(items, 2, async (n) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 1));
      running -= 1;
      return n * 2;
    });
    expect(out).toEqual([0, 2, 4, 6, 8, 10, 12]);
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("空配列でも待ち続けない", async () => {
    await expect(runPool([], 3, async () => 1)).resolves.toEqual([]);
  });

  it("worker には添字も渡る", async () => {
    await expect(runPool(["a", "b"], 5, async (s, i) => `${i}:${s}`)).resolves.toEqual(["0:a", "1:b"]);
  });
});
