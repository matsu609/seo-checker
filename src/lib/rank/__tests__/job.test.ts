/**
 * 順位計測の自動化（毎週火曜）の回し方（2026-09-23）。
 *
 * - 1 人の失敗で全員ぶんを止めない
 * - 同じ日に 2 回動いても、測り直さない・急落を二重に知らせない
 * - 前回たどり着けなかった人から始める
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JobContext } from "@/lib/jobs/types";
import type { UserAccess } from "@/lib/plans/user";
import type { SerpProvider } from "@/lib/serp/types";
import { runRankWeekly, type RankJobDeps } from "../job";
import type { RankMeasureItem } from "../types";
import type { RankSnapshot } from "../store";

afterEach(() => {
  vi.restoreAllMocks();
});

/** 2026-09-22（火）5:00 JST */
const NOW = new Date("2026-09-21T20:00:00Z");
const TODAY = "2026-09-22";

function ctx(remaining = 200_000): JobContext {
  const deadline = Date.now() + remaining;
  return { now: NOW, deadline, remainingMs: () => deadline - Date.now() };
}

const project = { id: "pj", name: "サンプル工房", domain: "sample-kobo.jp", startUrl: "https://sample-kobo.jp/", brandAliases: [], competitors: [], createdAt: "2026-09-01T00:00:00Z" };
const keywords = [{ id: "k1", projectId: "pj", keyword: "SEO ツール", device: "desktop", createdAt: "2026-09-01T00:00:00Z" }];

function snapshot(takenOn: string, rank: number | null): RankSnapshot {
  return {
    keywordId: "k1",
    takenOn,
    measuredAt: `${takenOn}T00:00:00Z`,
    rank,
    url: null,
    title: null,
    competitors: [],
    aiOverview: { present: false, selfCited: false, competitorCited: false, references: [] },
    features: [],
  };
}

function measured(rank: number | null): RankMeasureItem {
  return {
    ok: true,
    keyword: "SEO ツール",
    device: "desktop",
    rank,
    url: null,
    title: null,
    competitors: [],
    aiOverview: { present: false, selfCited: false, competitorCited: false, references: [] },
    features: [],
    totalResults: null,
    fetchedAt: NOW.toISOString(),
  };
}

const access = (over: Partial<UserAccess> = {}): UserAccess => ({ userId: "x", plan: "premium", overrides: [], admin: false, email: null, missing: false, ...over });

function deps(over: Partial<RankJobDeps> = {}) {
  const measuredUsers: string[] = [];
  const notified: string[] = [];
  const saved: { userId: string; snapshots: RankSnapshot[] }[] = [];
  const d: RankJobDeps = {
    listUsers: async () => [
      { userId: "u2", value: keywords },
      { userId: "u1", value: keywords },
      { userId: "u3", value: keywords },
    ],
    loadStores: async () => ({ projects: [project], currentProjectId: "pj" }),
    access: async () => access(),
    provider: { id: "fake" } as unknown as SerpProvider,
    history: async () => [snapshot("2026-09-15", 3)],
    save: async (userId, snapshots) => {
      saved.push({ userId, snapshots: [...snapshots] });
    },
    notify: async (userId) => {
      notified.push(userId);
      return { saved: true, emailed: false, reason: null };
    },
    cursor: async () => null,
    measure: async (_provider, targets) => {
      measuredUsers.push(String(targets.length));
      return { items: targets.map(() => measured(20)), fatal: null };
    },
    ...over,
  };
  return { d, measuredUsers, notified, saved };
}

describe("順位計測の自動化", () => {
  it("1 人の保存が失敗しても、ほかの人は測って知らせる", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const t = deps({
      save: async (userId, snapshots) => {
        if (userId === "u1") throw new Error("データベースがエラーを返しました（HTTP 500）");
        t.saved.push({ userId, snapshots: [...snapshots] });
      },
    });
    const result = await runRankWeekly(ctx(), t.d);
    expect(t.saved.map((s) => s.userId)).toEqual(["u2", "u3"]);
    expect(t.notified).toEqual(["u2", "u3"]);
    expect(result.summary).toMatchObject({ userErrors: 1, measured: 2, alerts: 2 });
    expect(result.aborted).toBe(false);
  });

  it("設定の読み込みが失敗しても、その人だけ飛ばす", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const t = deps({
      loadStores: async (userId) => {
        if (userId === "u2") throw new Error("読めません");
        return { projects: [project], currentProjectId: "pj" };
      },
    });
    const result = await runRankWeekly(ctx(), t.d);
    expect(t.saved.map((s) => s.userId)).toEqual(["u1", "u3"]);
    expect(result.summary).toMatchObject({ userErrors: 1 });
  });

  it("今日すでに測った語は測り直さず、急落も二重に知らせない（同じ日の再実行）", async () => {
    const t = deps({ history: async () => [snapshot("2026-09-15", 3), snapshot(TODAY, 20)] });
    const result = await runRankWeekly(ctx(), t.d);
    expect(t.measuredUsers).toEqual([]);
    expect(t.notified).toEqual([]);
    expect(result.summary).toMatchObject({ alreadyMeasured: 3, measured: 0 });
  });

  it("前回たどり着けなかった人から始める（ID の順に一周）", async () => {
    const order: string[] = [];
    const t = deps({
      cursor: async () => "u2",
      save: async (userId) => {
        order.push(userId);
      },
    });
    await runRankWeekly(ctx(), t.d);
    expect(order).toEqual(["u2", "u3", "u1"]);
  });

  it("時間切れのときは次に始める人を summary に残す", async () => {
    const t = deps();
    const result = await runRankWeekly(ctx(10_000), t.d);
    expect(result.aborted).toBe(true);
    expect(result.summary).toMatchObject({ nextStart: "u1" });
  });

  it("プランで使えない人は測らない", async () => {
    const t = deps({ access: async (userId) => access({ plan: userId === "u3" ? "free" : "premium" }) });
    const result = await runRankWeekly(ctx(), t.d);
    expect(t.saved.map((s) => s.userId)).toEqual(["u1", "u2"]);
    expect(result.summary).toMatchObject({ skippedPlan: 1 });
  });
});
