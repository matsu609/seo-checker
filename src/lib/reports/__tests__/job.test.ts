/**
 * 月次レポートを同じ月に 2 回知らせない（2026-09-23）。
 *
 * 以前は送った印を見ずに全員へ送っていたので、「今すぐ実行」・Cron の再送・取り返しの日のたびに
 * 全員へ同じメールとお知らせが届いた。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JobContext } from "@/lib/jobs/types";
import type { UserAccess } from "@/lib/plans/user";
import { runMonthlyReport, type ReportJobDeps } from "../job";
import { reportLink } from "../store";
import type { MonthlyReport } from "../types";

afterEach(() => {
  vi.restoreAllMocks();
});

function ctx(remaining = 200_000): JobContext {
  const deadline = Date.now() + remaining;
  // 2026-10-01 5:00 JST → 前月（2026-09）分
  return { now: new Date("2026-09-30T20:00:00Z"), deadline, remainingMs: () => deadline - Date.now() };
}

const access = (plan: UserAccess["plan"] = "premium"): UserAccess => ({ userId: "x", plan, overrides: [], admin: false, email: null, missing: false });

function deps(notified: Set<string>, over: Partial<ReportJobDeps> = {}) {
  const generated: string[] = [];
  const d: ReportJobDeps = {
    listUserIds: async () => ["u1", "u2", "u3"],
    access: async () => access(),
    alreadyNotified: async (userId, month) => notified.has(`${userId}|${month}`),
    generate: async (userId, month) => {
      generated.push(userId);
      notified.add(`${userId}|${month}`);
      return {} as MonthlyReport;
    },
    ...over,
  };
  return { d, generated };
}

describe("月次レポートの定期実行", () => {
  it("もう知らせた人は作り直さずに飛ばす（2 回目の実行では誰にも送らない）", async () => {
    const notified = new Set<string>(["u2|2026-09"]);
    const t = deps(notified);
    const first = await runMonthlyReport(ctx(), t.d);
    expect(t.generated).toEqual(["u1", "u3"]);
    expect(first.summary).toMatchObject({ month: "2026-09", generated: 2, alreadySent: 1 });

    const again = await runMonthlyReport(ctx(), t.d);
    expect(t.generated).toEqual(["u1", "u3"]);
    expect(again.summary).toMatchObject({ generated: 0, alreadySent: 3 });
  });

  it("別の月のお知らせは関係ない", async () => {
    const t = deps(new Set(["u1|2026-08"]));
    await runMonthlyReport(ctx(), t.d);
    expect(t.generated).toEqual(["u1", "u2", "u3"]);
  });

  it("確かめられなかった人は失敗として数え、後ろの人は続ける", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const t = deps(new Set(), {
      alreadyNotified: async (userId) => {
        if (userId === "u1") throw new Error("読めません");
        return false;
      },
    });
    const result = await runMonthlyReport(ctx(), t.d);
    expect(t.generated).toEqual(["u2", "u3"]);
    expect(result.summary).toMatchObject({ failed: 1 });
  });

  it("プランで使えない人には作らない", async () => {
    const t = deps(new Set(), { access: async (userId) => access(userId === "u2" ? "free" : "premium") });
    const result = await runMonthlyReport(ctx(), t.d);
    expect(t.generated).toEqual(["u1", "u3"]);
    expect(result.summary).toMatchObject({ skippedPlan: 1 });
  });

  it("お知らせのリンクで月を突き合わせる", () => {
    expect(reportLink("2026-09")).toBe("/tools/reports?month=2026-09");
  });
});
