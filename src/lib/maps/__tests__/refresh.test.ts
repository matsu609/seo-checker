/**
 * 週 1 回の一斉更新のテスト。
 * 「次回の更新日時が月曜 5:00 JST になる」「同じ店舗は 1 回だけ取る」
 * 「1 店舗の失敗で止まらない」「キーのエラーでは止まる」「時間切れで残りを次回に回す」。
 */
import { describe, expect, it, vi } from "vitest";
import fixture from "./fixtures/place.json";
import { PlacesError } from "../client";
import { parseDetailResponse } from "../parse";
import { emptyOwnerInput } from "../owner-input";
import { lastRefreshAt, nextRefreshAt, refreshStores, type RefreshDeps } from "../refresh";
import type { MeoStoreRow } from "../stores";

describe("次回の一斉更新", () => {
  const cases: [string, string][] = [
    // 水曜 → 次の月曜 5:00 JST（= 日曜 20:00 UTC）
    ["2026-09-09T05:00:00.000Z", "2026-09-13T20:00:00.000Z"],
    // 月曜 4:59 JST → 当日 5:00
    ["2026-09-13T19:59:00.000Z", "2026-09-13T20:00:00.000Z"],
    // 月曜 5:00 JST ちょうど → 翌週
    ["2026-09-13T20:00:00.000Z", "2026-09-20T20:00:00.000Z"],
    // 月曜 5:01 JST → 翌週
    ["2026-09-13T20:01:00.000Z", "2026-09-20T20:00:00.000Z"],
    // 日曜 23:30 JST（= 日曜 14:30 UTC）→ 翌朝
    ["2026-09-13T14:30:00.000Z", "2026-09-13T20:00:00.000Z"],
    // 月末〜月初をまたぐ
    ["2026-09-30T00:00:00.000Z", "2026-10-04T20:00:00.000Z"],
  ];
  it.each(cases)("%s → %s", (now, expected) => {
    expect(nextRefreshAt(new Date(now)).toISOString()).toBe(expected);
  });

  it("直前の更新は次回の 7 日前", () => {
    expect(lastRefreshAt(new Date("2026-09-09T05:00:00.000Z")).toISOString()).toBe("2026-09-06T20:00:00.000Z");
  });
});

function row(placeId: string, userId: string, ownPlaceId = ""): MeoStoreRow {
  return {
    id: `${placeId}-${userId}`,
    user_id: userId,
    place_id: placeId,
    place_name: placeId,
    own_place_id: ownPlaceId,
    created_at: "2026-09-01T00:00:00Z",
    last_refreshed_at: null,
  };
}

const DETAIL = parseDetailResponse(fixture)!;

function deps(rows: MeoStoreRow[], overrides: Partial<RefreshDeps> = {}) {
  const getDetail = vi.fn(async (placeId: string) => ({ ...DETAIL, id: placeId }));
  const save = vi.fn(async () => undefined);
  const markRefreshed = vi.fn(async () => undefined);
  const d: RefreshDeps = { listDue: async () => rows, getDetail, save, markRefreshed, ...overrides };
  return { d, getDetail, save, markRefreshed };
}

describe("一斉更新のループ", () => {
  it("同じ店舗を複数の利用者が登録していても Google には 1 回、保存は利用者ごと", async () => {
    const { d, getDetail, save, markRefreshed } = deps([row("A", "u1"), row("A", "u2"), row("B", "u1")]);
    const summary = await refreshStores(d, { limit: 100, budgetMs: 60_000 });
    expect(getDetail).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenCalledTimes(3);
    expect(markRefreshed).toHaveBeenCalledTimes(2);
    expect(summary).toMatchObject({ rows: 3, fetched: 2, saved: 3, failed: 0, remaining: 0, aborted: null });
    // 保存される報告書は取り直した詳細から作られている
    const [userId, report] = save.mock.calls[0] as unknown as [string, { detail: { id: string } }];
    expect(userId).toBe("u1");
    expect(report.detail.id).toBe("A");
  });

  it("見つからない店舗は飛ばして続ける", async () => {
    const { d, save } = deps([row("A", "u1"), row("B", "u1")], {
      getDetail: async (id) => {
        if (id === "A") throw new PlacesError("消えた", "not_found");
        return { ...DETAIL, id };
      },
    });
    const summary = await refreshStores(d, { limit: 100, budgetMs: 60_000 });
    expect(summary).toMatchObject({ fetched: 1, saved: 1, failed: 1, aborted: null });
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("キー・上限のエラーは全体を止め、残りを数える", async () => {
    const { d, save } = deps([row("A", "u1"), row("B", "u1"), row("C", "u1")], {
      getDetail: async (id) => {
        if (id === "B") throw new PlacesError("上限", "rate_limited");
        return { ...DETAIL, id };
      },
    });
    const summary = await refreshStores(d, { limit: 100, budgetMs: 60_000 });
    expect(summary.aborted).toBe("上限");
    expect(summary.fetched).toBe(1);
    expect(summary.remaining).toBe(2);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("時間切れなら残りを次回に回す", async () => {
    let t = 0;
    const { d, getDetail } = deps([row("A", "u1"), row("B", "u1"), row("C", "u1")], {
      now: () => new Date(1_000_000 + (t += 1000)),
    });
    const summary = await refreshStores(d, { limit: 100, budgetMs: 1500 });
    expect(getDetail.mock.calls.length).toBeLessThan(3);
    expect(summary.remaining).toBeGreaterThan(0);
    expect(summary.remaining + summary.fetched).toBe(3);
  });

  it("保存の失敗は failed に数えて続ける", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { d } = deps([row("A", "u1"), row("A", "u2")], {
      save: async (userId) => {
        if (userId === "u2") throw new Error("db");
      },
    });
    const summary = await refreshStores(d, { limit: 100, budgetMs: 60_000 });
    expect(summary).toMatchObject({ fetched: 1, saved: 1, failed: 1, aborted: null });
    spy.mockRestore();
  });
});

describe("一斉更新とオーナー申告", () => {
  it("自社として登録した利用者の報告書にだけ申告を足す（競合として登録した利用者は公開情報だけ）", async () => {
    const getOwnerInput = vi.fn(async (userId: string) =>
      userId === "u1" ? { input: { ...emptyOwnerInput(), openingDate: true, menu: true }, updatedAt: "2026-09-09T00:00:00Z" } : null,
    );
    // u1 は A を自社、u2 は A を（自社 B の）競合として登録
    const { d, save } = deps([row("A", "u1"), row("A", "u2", "B")], { getOwnerInput });
    const summary = await refreshStores(d, { limit: 100, budgetMs: 60_000 });
    expect(summary.saved).toBe(2);
    expect(getOwnerInput).toHaveBeenCalledTimes(1);
    expect(getOwnerInput).toHaveBeenCalledWith("u1", "A");
    const byUser = new Map(save.mock.calls.map((c) => c as unknown as [string, { score: { checks: { id: string; status: string }[] }; ownerInputAt: string | null }]));
    const u1 = byUser.get("u1")!;
    const u2 = byUser.get("u2")!;
    expect(u1.ownerInputAt).toBe("2026-09-09T00:00:00Z");
    expect(u1.score.checks.find((c) => c.id === "openingDate")?.status).toBe("pass");
    expect(u2.ownerInputAt).toBeNull();
    expect(u2.score.checks.find((c) => c.id === "openingDate")?.status).toBe("unavailable");
  });

  it("getOwnerInput が無ければ従来どおり", async () => {
    const { d, save } = deps([row("A", "u1")]);
    await refreshStores(d, { limit: 100, budgetMs: 60_000 });
    const [, report] = save.mock.calls[0] as unknown as [string, { ownerInputAt: string | null }];
    expect(report.ownerInputAt).toBeNull();
  });
});
