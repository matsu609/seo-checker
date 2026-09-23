/**
 * サイトの事故監視（毎週水曜）の回し方（2026-09-23）。
 *
 * 定期実行も「いまのホームページ」（設定で選んでいるもの）を見る。以前は常に 1 件目を見ていて、
 * 画面の「今すぐ確認」・月次レポートと別のサイトを監視していた。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { JobContext } from "@/lib/jobs/types";
import type { UserAccess } from "@/lib/plans/user";
import { monitorTargetUrl, runSiteMonitor, type MonitorJobDeps } from "../job";

afterEach(() => {
  vi.restoreAllMocks();
});

const first = { id: "a", name: "本店", domain: "honten.jp", startUrl: "", brandAliases: [], competitors: [], createdAt: "2026-09-01T00:00:00Z" };
const second = { id: "b", name: "2 号店", domain: "nigou.jp", startUrl: "https://nigou.jp/top", brandAliases: [], competitors: [], createdAt: "2026-09-02T00:00:00Z" };

function ctx(remaining = 200_000): JobContext {
  const deadline = Date.now() + remaining;
  return { now: new Date("2026-09-22T20:00:00Z"), deadline, remainingMs: () => deadline - Date.now() };
}

const access = (): UserAccess => ({ userId: "x", plan: "premium", overrides: [], admin: false, email: null, missing: false });

describe("監視するサイト", () => {
  it("設定で選んでいるホームページを見る（1 件目ではない）", () => {
    expect(monitorTargetUrl([first, second], "b")).toBe("https://nigou.jp/top");
    expect(monitorTargetUrl([first, second], "a")).toBe("https://honten.jp/");
  });

  it("選んでいない・選んだものが消えたときは 1 件目（画面と同じ決まり）", () => {
    expect(monitorTargetUrl([first, second], null)).toBe("https://honten.jp/");
    expect(monitorTargetUrl([first, second], undefined)).toBe("https://honten.jp/");
    expect(monitorTargetUrl([first, second], "gone")).toBe("https://honten.jp/");
    expect(monitorTargetUrl([], "b")).toBe("");
    expect(monitorTargetUrl("壊れた値", "b")).toBe("");
  });
});

describe("定期実行", () => {
  function deps(over: Partial<MonitorJobDeps> = {}) {
    const checked: string[] = [];
    const d: MonitorJobDeps = {
      listUsers: async () => [
        { userId: "u2", value: [first, second] },
        { userId: "u1", value: [first, second] },
      ],
      currentProjectId: async (userId) => (userId === "u1" ? "b" : null),
      access: async () => access(),
      monitor: async (userId, siteUrl) => {
        checked.push(`${userId}:${siteUrl}`);
        return {
          snapshot: { origin: new URL(siteUrl).origin, checkedAt: "", pages: [], links: { checked: 0, broken: [] }, robots: { fetched: true, blocksAll: false }, sitemap: { url: "", ok: true, status: 200 }, ssl: null, incidents: [] },
          diff: { opened: [], resolved: [], ongoing: [] },
        } as unknown as Awaited<ReturnType<MonitorJobDeps["monitor"]>>;
      },
      cursor: async () => null,
      ...over,
    };
    return { d, checked };
  }

  it("利用者ごとに、その人が選んでいるホームページを確認する", async () => {
    const t = deps();
    await runSiteMonitor(ctx(), t.d);
    expect(t.checked).toEqual(["u1:https://nigou.jp/top", "u2:https://honten.jp/"]);
  });

  it("選択中の読み込みが失敗しても、その人だけ飛ばす", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const t = deps({
      currentProjectId: async (userId) => {
        if (userId === "u1") throw new Error("読めません");
        return null;
      },
    });
    const result = await runSiteMonitor(ctx(), t.d);
    expect(t.checked).toEqual(["u2:https://honten.jp/"]);
    expect(result.summary).toMatchObject({ failed: 1, checked: 1 });
  });

  it("前回の続きから始め、時間切れなら次に始める人を残す", async () => {
    const t = deps({ cursor: async () => "u2" });
    await runSiteMonitor(ctx(), t.d);
    expect(t.checked.map((c) => c.split(":")[0])).toEqual(["u2", "u1"]);
    const late = await runSiteMonitor(ctx(10_000), deps().d);
    expect(late.aborted).toBe(true);
    expect(late.summary).toMatchObject({ nextStart: "u1" });
  });
});
