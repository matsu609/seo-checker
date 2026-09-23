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
import { classifyRefreshError, lastRefreshAt, MAX_CONSECUTIVE_TRANSIENT, nextRefreshAt, refreshStores, type RefreshDeps } from "../refresh";
import type { PlaceDetail } from "../types";
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

describe("一斉更新と順位・周辺（r29）", () => {
  it("自社の報告書にだけ enrich の結果を付け、失敗しても保存は止めない", async () => {
    const enrich = vi.fn(async (userId: string) => {
      if (userId === "u3") throw new Error("Google の上限");
      return { rank: { center: { lat: 0, lng: 0 }, radiusM: 3000, limit: 20, keywords: [] }, area: null };
    });
    // u1: A を自社、u2: A を競合、u3: A を自社（enrich が失敗）
    const { d, save } = deps([row("A", "u1"), row("A", "u2", "B"), row("A", "u3")], { enrich });
    const summary = await refreshStores(d, { limit: 100, budgetMs: 60_000 });
    expect(summary.saved).toBe(3);
    expect(enrich).toHaveBeenCalledTimes(2);
    const byUser = new Map(save.mock.calls.map((c) => c as unknown as [string, { rank?: unknown; area?: unknown }]));
    expect(byUser.get("u1")!.rank).toBeTruthy();
    expect(byUser.get("u1")!.area).toBeNull();
    expect(byUser.get("u2")!.rank).toBeUndefined();
    expect(byUser.get("u3")!.rank).toBeUndefined();
  });
});

describe("一時的な失敗で全体を止めない（2026-09-23）", () => {
  function timeout(): Error {
    // AbortSignal.timeout が投げるのは PlacesError ではなく name = TimeoutError の DOMException
    return new DOMException("The operation was aborted due to timeout", "TimeoutError");
  }

  it("1 店舗のタイムアウトや Google の 5xx は failed に数えて次の店舗へ進む", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { d, save, markRefreshed } = deps([row("A", "u1"), row("B", "u1"), row("C", "u1"), row("D", "u1")], {
      getDetail: async (id) => {
        if (id === "A") throw timeout();
        if (id === "B") throw new PlacesError("Google マップの API がエラーを返しました（HTTP 503）", "upstream");
        if (id === "C") throw new TypeError("fetch failed");
        return { ...DETAIL, id };
      },
    });
    const summary = await refreshStores(d, { limit: 100, budgetMs: 60_000 });
    expect(summary).toMatchObject({ fetched: 1, saved: 1, failed: 3, remaining: 0, aborted: null });
    expect(save).toHaveBeenCalledTimes(1);
    // 取れなかった店舗は更新日時を進めない（次回の先頭で取り直す）
    expect(markRefreshed).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("キー未設定・拒否（403）も全体を止める", async () => {
    for (const code of ["not_configured", "denied"] as const) {
      const { d } = deps([row("A", "u1"), row("B", "u1")], {
        getDetail: async () => {
          throw new PlacesError("止める", code);
        },
      });
      const summary = await refreshStores(d, { limit: 100, budgetMs: 60_000 });
      expect(summary).toMatchObject({ fetched: 0, aborted: "止める", remaining: 2 });
    }
  });

  it("一時的な失敗が続いたら Google 側の障害とみて止め、残りを次回に回す", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const ids = ["A", "B", "C", "D", "E", "F", "G", "H"];
    const getDetail = vi.fn(async (): Promise<PlaceDetail> => {
      throw timeout();
    });
    const { d } = deps(
      ids.map((id) => row(id, "u1")),
      { getDetail },
    );
    const summary = await refreshStores(d, { limit: 100, budgetMs: 60_000 });
    expect(getDetail).toHaveBeenCalledTimes(MAX_CONSECUTIVE_TRANSIENT);
    expect(summary.failed).toBe(MAX_CONSECUTIVE_TRANSIENT);
    expect(summary.remaining).toBe(ids.length - MAX_CONSECUTIVE_TRANSIENT);
    expect(summary.aborted).toContain("続けて応答しなかった");
    spy.mockRestore();
  });

  it("成功をはさめば連続には数えない", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const ids = Array.from({ length: 12 }, (_, i) => `P${i}`);
    const { d } = deps(
      ids.map((id) => row(id, "u1")),
      {
        getDetail: async (id) => {
          // 4 回失敗 → 1 回成功 を繰り返す
          if (Number(id.slice(1)) % 5 !== 4) throw timeout();
          return { ...DETAIL, id };
        },
      },
    );
    const summary = await refreshStores(d, { limit: 100, budgetMs: 60_000 });
    expect(summary.aborted).toBeNull();
    expect(summary.fetched + summary.failed).toBe(12);
    spy.mockRestore();
  });

  it("失敗の分類", () => {
    expect(classifyRefreshError(new PlacesError("x", "rate_limited"))).toBe("fatal");
    expect(classifyRefreshError(new PlacesError("x", "not_found"))).toBe("skip");
    expect(classifyRefreshError(new PlacesError("x", "upstream"))).toBe("transient");
    expect(classifyRefreshError(timeout())).toBe("transient");
  });
});

describe("プランの対象外の利用者（2026-09-23）", () => {
  it("対象外の利用者の行は飛ばし、誰も使えない店舗は Google に問い合わせない", async () => {
    const allowsUser = vi.fn(async (userId: string) => userId !== "gone");
    // A: 使える u1 と対象外の gone が共有 / B: gone だけ（自社と競合の 2 行） / C: u2 だけ
    const { d, getDetail, save, markRefreshed } = deps([row("A", "u1"), row("A", "gone"), row("B", "gone"), row("C", "u2"), row("B", "gone", "A")], { allowsUser });
    const summary = await refreshStores(d, { limit: 100, budgetMs: 60_000 });
    expect(getDetail.mock.calls.map((c) => c[0])).toEqual(["A", "C"]);
    expect(save.mock.calls.map((c) => (c as unknown as [string])[0])).toEqual(["u1", "u2"]);
    expect(summary).toMatchObject({ fetched: 2, saved: 2, skippedPlan: 1, aborted: null });
    // 判定は利用者ごとに 1 回
    expect(allowsUser).toHaveBeenCalledTimes(3);
    // 飛ばした店舗も更新日時は進める（古い順の先頭に居座って、ほかの店舗を押し出さない）
    expect(markRefreshed.mock.calls.map((c) => (c as unknown as [string])[0])).toEqual(["A", "B", "C"]);
  });

  it("プランの判定が失敗した利用者は対象外として扱う（開ける方向には倒さない）", async () => {
    const { d, getDetail } = deps([row("A", "u1")], {
      allowsUser: async () => {
        throw new Error("clerk down");
      },
    });
    const summary = await refreshStores(d, { limit: 100, budgetMs: 60_000 });
    expect(getDetail).not.toHaveBeenCalled();
    expect(summary.skippedPlan).toBe(1);
  });
});
