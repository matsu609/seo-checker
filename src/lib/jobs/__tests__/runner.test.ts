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

describe("月次のジョブの取り返し（2026-09-23）", () => {
  /** 2026-12-01（火）5:00 JST */
  const DEC_1 = new Date("2026-11-30T20:00:00Z");
  /** 2026-12-02（水）5:00 JST */
  const DEC_2 = new Date("2026-12-01T20:00:00Z");

  it("1 日が火曜でも、月次レポートは順位計測より先に動き、上限の時間しか渡されない", async () => {
    const calls: string[] = [];
    let reportBudget = 0;
    const defs = [
      def("monthly-report", async (ctx) => {
        calls.push("monthly-report");
        reportBudget = ctx.remainingMs();
        return { summary: {} };
      }),
      def("rank-weekly", async (ctx) => {
        calls.push("rank-weekly");
        // 月次レポートが上限まで使っても、順位計測の最低限（60 秒）は残る
        expect(ctx.remainingMs()).toBeGreaterThan(60_000);
        return { summary: {} };
      }),
    ];
    await runJobs(defs, { now: DEC_1, budgetMs: 250_000, record: false });
    expect(calls).toEqual(["monthly-report", "rank-weekly"]);
    expect(reportBudget).toBeLessThanOrEqual(90_000);
  });

  it("予定日に済んでいなければ翌日に取り返す。済んでいれば動かさず、その飛ばしは記録しない", async () => {
    const run = vi.fn(async () => ({ summary: {} }));
    const skipped: string[] = [];
    const sinceSeen: string[] = [];
    const notDone = await runJobs([def("monthly-report", run)], {
      now: DEC_2,
      budgetMs: 250_000,
      record: false,
      completedSince: async (_job, since) => {
        sinceSeen.push(since);
        return false;
      },
      recordSkipped: async (job) => {
        skipped.push(job);
      },
    });
    expect(notDone[0].status).toBe("ok");
    expect(run).toHaveBeenCalledTimes(1);
    // 今月の 1 日 0:00（日本時間）以降の記録を見る
    expect(sinceSeen).toEqual(["2026-11-30T15:00:00.000Z"]);

    const done = await runJobs([def("monthly-report", run)], { now: DEC_2, budgetMs: 250_000, record: false, completedSince: async () => true, recordSkipped: async (job) => void skipped.push(job) });
    expect(done[0]).toMatchObject({ status: "skipped", reason: "今月はもう済んでいます" });
    expect(run).toHaveBeenCalledTimes(1);
    expect(skipped).toEqual([]);
  });

  it("「今すぐ実行」（force）は済んでいても動かす", async () => {
    const run = vi.fn(async () => ({ summary: {} }));
    const out = await runJobs([def("monthly-report", run)], { now: DEC_2, budgetMs: 250_000, only: ["monthly-report"], force: true, record: false, completedSince: async () => true });
    expect(out[0].status).toBe("ok");
    expect(run).toHaveBeenCalledTimes(1);
  });

  it("残り時間が足りずに飛ばしたときは記録に残す", async () => {
    const skipped: { job: string; reason: string }[] = [];
    const out = await runJobs([def("seo-reanalysis", async () => ({ summary: {} }))], {
      now: DEC_2,
      budgetMs: 10_000,
      record: false,
      recordSkipped: async (job, reason) => {
        skipped.push({ job, reason });
      },
    });
    expect(out[0].status).toBe("skipped");
    expect(skipped).toHaveLength(1);
    expect(skipped[0].job).toBe("seo-reanalysis");
    expect(skipped[0].reason).toMatch(/残り時間/);
  });
});
