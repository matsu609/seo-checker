/**
 * 精密診断の進捗メーター。単調に増え、結果を受け取るまで 100 にならないことを固定する。
 */
import { describe, expect, it } from "vitest";
import { ANALYZE_EXPECTED_MS, diagnosisProgress, DIAGNOSIS_STAGES, stageOfStep, stageStates, timeRatio } from "../progress";

describe("ステージ", () => {
  it("5 段階が 0 から 100 まで隙間なく並ぶ", () => {
    expect(DIAGNOSIS_STAGES[0].from).toBe(0);
    expect(DIAGNOSIS_STAGES[DIAGNOSIS_STAGES.length - 1].to).toBe(100);
    for (let i = 1; i < DIAGNOSIS_STAGES.length; i += 1) expect(DIAGNOSIS_STAGES[i].from).toBe(DIAGNOSIS_STAGES[i - 1].to);
  });

  it("収集の step は 5 段階のどれかに落ちる（並行取得の 4 つは同じ段階）", () => {
    expect(stageOfStep("crawl")).toBe("crawl");
    expect(stageOfStep("speed")).toBe("signals");
    expect(stageOfStep("search")).toBe("signals");
    expect(stageOfStep("domain")).toBe("signals");
    expect(stageOfStep("llms")).toBe("signals");
    expect(stageOfStep("google")).toBe("signals");
    expect(stageOfStep("sheet")).toBe("sheet");
  });

  it("済み・進行中・これから", () => {
    const states = stageStates("signals", false).map((s) => s.state);
    expect(states).toEqual(["done", "done", "active", "todo", "todo"]);
    expect(stageStates(null, true).every((s) => s.state === "done")).toBe(true);
  });
});

describe("クロールの進み", () => {
  it("取得ページ数が増えるほど進み、45% を超えない", () => {
    const at = (fetched: number, queued: number) => diagnosisProgress({ phase: "collecting", step: "crawl", audit: { fetched, queued }, maxPages: 200, stageElapsedMs: 0 }).percent;
    expect(at(0, 0)).toBe(0);
    expect(at(10, 90)).toBeGreaterThan(0);
    expect(at(50, 50)).toBeGreaterThan(at(10, 90));
    expect(at(200, 0)).toBeLessThanOrEqual(45);
    // 小さいサイト（見つかった分を全部取った）は上限近くまで進む
    expect(at(30, 0)).toBeGreaterThanOrEqual(40);
  });
});

describe("AI 分析の進み", () => {
  it("経過時間と出力文字数の大きいほうで進み、99 で止まる", () => {
    const p = (ms: number, chars: number) => diagnosisProgress({ phase: "analyzing", maxPages: 200, stageElapsedMs: ms, outputChars: chars }).percent;
    expect(p(0, 0)).toBe(75);
    expect(p(30_000, 0)).toBeGreaterThan(75);
    expect(p(0, 6_000)).toBeGreaterThan(p(0, 1_000));
    expect(p(ANALYZE_EXPECTED_MS * 5, 100_000)).toBe(99);
    expect(p(ANALYZE_EXPECTED_MS * 5, 0)).toBeLessThanOrEqual(99);
  });

  it("時間の曲線は単調に増えて 1 を超えない", () => {
    let prev = -1;
    for (let ms = 0; ms <= 1_000_000; ms += 10_000) {
      const r = timeRatio(ms, 100_000);
      expect(r).toBeGreaterThanOrEqual(prev);
      expect(r).toBeLessThanOrEqual(1);
      prev = r;
    }
  });
});
