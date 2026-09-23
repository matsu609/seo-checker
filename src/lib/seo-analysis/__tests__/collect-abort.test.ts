/**
 * 収集の中断（2026-09-23）。
 *
 * crawlSite は中断されても例外を出さずに途中までのページを返す。以前はそれが
 * 普通の診断として保存され、自動再診断では前回（全ページ）との比較で
 * 「悪化した点」をお客様に知らせていた。中断されたら事実シートを作らずに止め、
 * 自動再診断は失敗として記録する（保存・通知をしない）ことを確かめる。
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createRun: vi.fn(),
  createFailedRun: vi.fn(),
  previousRun: vi.fn(),
  getRun: vi.fn(),
  notifyUser: vi.fn(),
}));

vi.mock("../runs", () => ({
  createRun: mocks.createRun,
  createFailedRun: mocks.createFailedRun,
  previousRun: mocks.previousRun,
  getRun: mocks.getRun,
}));
vi.mock("@/lib/notifications/notify", () => ({ notifyUser: mocks.notifyUser }));

let server: Server;
let origin: string;

beforeAll(async () => {
  process.env.ALLOW_PRIVATE_HOSTS = "1";
  server = createServer((req, res) => {
    if ((req.url ?? "/") === "/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end('<!doctype html><html><head><title>トップ</title></head><body><h1>トップ</h1><a href="/a">A</a></body></html>');
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  delete process.env.ALLOW_PRIVATE_HOSTS;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockReset();
});

describe("収集の中断", () => {
  it("中断されたら途中までのクロールで事実シートを作らず CollectAbortedError で止める", async () => {
    const { collectFactSheet, CollectAbortedError } = await import("../collect");
    const controller = new AbortController();
    controller.abort();
    await expect(
      collectFactSheet(
        { url: origin, keywords: ["kw"], industry: "", goal: "other", region: "", competitors: [], brand: "", maxPages: 10 },
        { signal: controller.signal },
      ),
    ).rejects.toBeInstanceOf(CollectAbortedError);
  }, 30_000);

  it("自動再診断は中断されたら失敗として記録し、保存も通知もしない", async () => {
    const { reanalyzeSite } = await import("../job");
    const controller = new AbortController();
    controller.abort();
    const result = await reanalyzeSite(
      { userId: "u1", origin, lastOkAt: "2026-08-01T00:00:00Z", input: { url: origin } },
      { now: new Date(), deadline: Date.now() + 60_000, signal: controller.signal },
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("時間内に収集が終わりませんでした");
    expect(mocks.createRun).not.toHaveBeenCalled();
    expect(mocks.notifyUser).not.toHaveBeenCalled();
    expect(mocks.createFailedRun).toHaveBeenCalledTimes(1);
  }, 30_000);
});
