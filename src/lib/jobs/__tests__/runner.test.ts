import { describe, expect, it, vi } from "vitest";
import { runJobs, type JobDefinition } from "../runner";

const def = (id: JobDefinition["id"], run: JobDefinition["run"]): JobDefinition => ({ id, run });

describe("ジョブの実行", () => {
  it("その日の due だけを順に動かし、1 本の失敗で後ろを止めない", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const calls: string[] = [];
    const defs = [
      def("gbp-posts", async () => {
        calls.push("gbp-posts");
        return { summary: { sent: 1 } };
      }),
      def("rank-weekly", async () => {
        calls.push("rank-weekly");
        throw new Error("壊れた");
      }),
      def("seo-reanalysis", async () => {
        calls.push("seo-reanalysis");
        return { summary: { done: 0 }, aborted: true };
      }),
      def("site-monitor", async () => {
        calls.push("site-monitor");
        return { summary: {} };
      }),
    ];
    // 2026-09-22（火）
    const out = await runJobs(defs, { now: new Date("2026-09-21T20:00:00Z"), budgetMs: 600_000, record: false });
    expect(calls).toEqual(["gbp-posts", "rank-weekly", "seo-reanalysis"]);
    expect(out.map((o) => [o.job, o.status])).toEqual([
      ["gbp-posts", "ok"],
      ["rank-weekly", "failed"],
      ["seo-reanalysis", "aborted"],
    ]);
    expect(out[1].summary).toEqual({ error: "壊れた" });
    spy.mockRestore();
  });

  it("残り時間が足りないジョブは飛ばす（理由つき）", async () => {
    const run = vi.fn(async () => ({ summary: {} }));
    const out = await runJobs([def("seo-reanalysis", run)], { now: new Date("2026-09-21T20:00:00Z"), budgetMs: 10_000, record: false });
    expect(run).not.toHaveBeenCalled();
    expect(out[0]).toMatchObject({ job: "seo-reanalysis", status: "skipped" });
    expect(out[0].reason).toMatch(/残り時間/);
  });

  it("only + force で予定日に関係なく 1 本だけ動かす", async () => {
    const run = vi.fn(async () => ({ summary: { ok: true } }));
    const out = await runJobs([def("monthly-report", run), def("gbp-posts", run)], { now: new Date("2026-09-21T20:00:00Z"), budgetMs: 600_000, only: ["monthly-report"], force: true, record: false });
    expect(out.map((o) => o.job)).toEqual(["monthly-report"]);
  });
});
