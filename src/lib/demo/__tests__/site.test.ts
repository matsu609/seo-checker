/** サイト監視・サイテーションの見本データ */
import { describe, expect, it } from "vitest";
import { MONITOR_WEEKDAY, SAMPLE_CHECKS, SAMPLE_COVERAGE, sampleIncidentChecks } from "../site";

const NOW = new Date("2026-09-22T03:00:00Z"); // 日本時間の火曜

describe("サイト監視の見本", () => {
  it("これからの水曜が並ぶ", () => {
    expect(MONITOR_WEEKDAY).toBe(3);
    expect(sampleIncidentChecks(SAMPLE_CHECKS, NOW).dates).toEqual(["2026-09-23", "2026-09-30", "2026-10-07", "2026-10-14"]);
  });

  it("最後は 0 件（0 件が続くのが正常だと分かる形）", () => {
    const { incidents } = sampleIncidentChecks(SAMPLE_CHECKS, NOW);
    expect(incidents).toHaveLength(SAMPLE_CHECKS);
    expect(incidents[incidents.length - 1]).toBe(0);
  });
});

describe("サイテーションの見本", () => {
  it("載っている・載っていないが両方ある", () => {
    expect(SAMPLE_COVERAGE.found).toBeGreaterThan(0);
    expect(SAMPLE_COVERAGE.missing).toBeGreaterThan(0);
  });
});
