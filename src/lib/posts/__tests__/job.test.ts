/**
 * 予約した投稿の送信ジョブ（2026-09-23）。依存を差し替えて、DB も Google も使わない。
 * 「対象外の利用者の投稿で枠が埋まっても、ほかの利用者の投稿は送る」「1 件の失敗で止まらない」。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JobContext } from "@/lib/jobs/types";
import { DUE_BATCH, runGbpPosts, type GbpPostsDeps } from "../job";
import type { PublishOutcome } from "../publish";
import type { GbpPost } from "../types";

const NOW = new Date("2026-09-23T20:00:00Z");
const ctx: JobContext = { now: NOW, deadline: Number.MAX_SAFE_INTEGER, remainingMs: () => 600_000 };

afterEach(() => {
  vi.restoreAllMocks();
});

function post(id: string, userId: string): GbpPost & { userId: string } {
  return {
    id,
    userId,
    placeId: "ChIJ0000000000",
    locationName: null,
    topicType: "STANDARD",
    title: "",
    summary: `本文 ${id}`,
    ctaType: "NONE",
    ctaUrl: "",
    eventStart: null,
    eventEnd: null,
    status: "scheduled",
    scheduledAt: "2026-09-01T00:00:00Z",
    publishedAt: null,
    googleName: null,
    error: null,
    createdAt: "2026-09-01T00:00:00Z",
    updatedAt: "2026-09-01T00:00:00Z",
  };
}

/** 予約済みの投稿の偽の表。送った（または失敗にした）投稿は予約済みから外れる */
function table(initial: (GbpPost & { userId: string })[]) {
  const scheduled = new Map(initial.map((p) => [p.id, p]));
  const listDue = vi.fn(async (_now: Date, limit: number, exclude: readonly string[]) => [...scheduled.values()].filter((p) => !exclude.includes(p.userId)).slice(0, limit));
  const done = (id: string) => scheduled.delete(id);
  return { listDue, done };
}

function deps(overrides: Partial<GbpPostsDeps> & Pick<GbpPostsDeps, "listDue">): GbpPostsDeps {
  return {
    allows: async () => true,
    publish: async (_u, p): Promise<PublishOutcome> => ({ post: p, ok: true, message: "ok" }),
    token: async () => "tok",
    notify: vi.fn(async () => undefined) as unknown as GbpPostsDeps["notify"],
    ...overrides,
  };
}

describe("runGbpPosts", () => {
  it("プランの対象外の利用者の投稿が 200 件の枠を埋めていても、ほかの利用者の投稿を送る", async () => {
    // 古い順に、対象外の利用者の投稿が枠いっぱい → そのあとに使える利用者の投稿
    const blocked = Array.from({ length: DUE_BATCH }, (_, i) => post(`b${i}`, "gone"));
    const t = table([...blocked, post("a1", "u1"), post("a2", "u2")]);
    const publish = vi.fn(async (_u: string, p: GbpPost): Promise<PublishOutcome> => {
      t.done(p.id);
      return { post: p, ok: true, message: "ok" };
    });
    const result = await runGbpPosts(ctx, deps({ listDue: t.listDue, allows: async (u) => u !== "gone", publish }));
    expect(publish.mock.calls.map((c) => c[1].id)).toEqual(["a1", "a2"]);
    expect(result.summary).toMatchObject({ published: 2, skippedPlan: DUE_BATCH });
    // 2 回目は対象外の利用者を除いて読む
    expect(t.listDue.mock.calls[1]![2]).toEqual(["gone"]);
  });

  it("1 人の送信の準備の失敗・お知らせの失敗で、ほかの利用者の投稿を止めない", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const t = table([post("x1", "u1"), post("y1", "u2"), post("z1", "u3")]);
    const publish = vi.fn(async (u: string, p: GbpPost): Promise<PublishOutcome> => {
      if (u === "u1") throw new Error("データベースに接続できませんでした");
      t.done(p.id);
      return u === "u2" ? { post: p, ok: false, message: "Google が拒否しました" } : { post: p, ok: true, message: "ok" };
    });
    const notify = vi.fn(async (userId: string) => {
      if (userId === "u2") throw new Error("notifications の保存に失敗");
      return undefined;
    }) as unknown as GbpPostsDeps["notify"];
    const result = await runGbpPosts(ctx, deps({ listDue: t.listDue, publish, notify }));
    expect(publish).toHaveBeenCalledTimes(3);
    expect(result.summary).toMatchObject({ published: 1, failed: 1, errors: 2 });
    expect(result.aborted).toBe(false);
  });

  it("別の処理が先に送信を始めていた投稿は、失敗にも成功にも数えず知らせない", async () => {
    const t = table([post("p1", "u1")]);
    const notify = vi.fn(async () => undefined) as unknown as GbpPostsDeps["notify"];
    const publish = vi.fn(async (_u: string, p: GbpPost): Promise<PublishOutcome> => {
      t.done(p.id);
      return { post: p, ok: false, skipped: true, message: "送信中" };
    });
    const result = await runGbpPosts(ctx, deps({ listDue: t.listDue, publish, notify }));
    expect(result.summary).toMatchObject({ published: 0, failed: 0, skippedBusy: 1 });
    expect(notify).not.toHaveBeenCalled();
  });

  it("トークンは利用者ごとに 1 回だけ取り、予定時刻を過ぎたものだけ送るよう伝える", async () => {
    const t = table([post("p1", "u1"), post("p2", "u1")]);
    const token = vi.fn(async () => "tok");
    const publish = vi.fn(async (_u: string, p: GbpPost, options: { getToken: () => Promise<string>; dueBy: Date }): Promise<PublishOutcome> => {
      await options.getToken();
      expect(options.dueBy).toBe(NOW);
      t.done(p.id);
      return { post: p, ok: true, message: "ok" };
    });
    await runGbpPosts(ctx, deps({ listDue: t.listDue, publish, token }));
    expect(token).toHaveBeenCalledTimes(1);
  });

  it("状態が変わらない投稿（準備の失敗が続く）でも同じ投稿を何度も読み直さない", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const t = table([post("p1", "u1")]);
    const publish = vi.fn(async (): Promise<PublishOutcome> => {
      throw new Error("db down");
    });
    await runGbpPosts(ctx, deps({ listDue: t.listDue, publish }));
    expect(publish).toHaveBeenCalledTimes(1);
    expect(t.listDue).toHaveBeenCalledTimes(2);
  });
});
