/**
 * /api/site と /api/analyze の入口の順番。
 *
 * 2026-10-02 から無料診断は専用リンク（src/lib/free/access.ts）で守り、月の回数（monthly.ts）は
 * **本当に外部へ取りに行くときだけ**数える。ここでは「専用リンクの確認が必ず最初に来る（401 なら何もしない）」ことと、
 * 形式の誤り・キャッシュ命中・混雑（429）では月の回数を数えないことを見る。判定は差し替えて、呼ばれた回数だけを数える。
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const access = vi.hoisted(() => ({
  requireFreeAccess: vi.fn(async () => null as Response | null),
}));
vi.mock("@/lib/free/access", () => access);
const monthly = vi.hoisted(() => ({
  checkFreeRun: vi.fn(async () => null as Response | null),
  recordFreeRun: vi.fn(async () => undefined),
}));
vi.mock("@/lib/free/monthly", () => monthly);

import { POST as analyzePost } from "@/app/api/analyze/route";
import { POST as sitePost } from "@/app/api/site/route";
import { acquireCrawlSlot } from "../gate";

let server: Server;
let origin: string;

beforeAll(async () => {
  process.env.ALLOW_PRIVATE_HOSTS = "1";
  server = createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(`<!doctype html><html lang="ja"><head><title>トップ ${req.url}</title></head><body><h1>トップ</h1><p>${"本文です。".repeat(50)}</p></body></html>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  delete process.env.ALLOW_PRIVATE_HOSTS;
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

beforeEach(() => {
  access.requireFreeAccess.mockReset();
  access.requireFreeAccess.mockResolvedValue(null);
  monthly.checkFreeRun.mockReset();
  monthly.checkFreeRun.mockResolvedValue(null);
  monthly.recordFreeRun.mockClear();
});

const request = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

describe("/api/site の入口", () => {
  it("専用ログインが無ければ 401 で、本文も読まない", async () => {
    access.requireFreeAccess.mockResolvedValue(Response.json({ code: "free_login" }, { status: 401 }));
    const res = await sitePost(request("/api/site", { url: "not a url" }));
    expect(res.status).toBe(401);
    expect(access.requireFreeAccess).toHaveBeenCalledTimes(1);
    expect(monthly.recordFreeRun).not.toHaveBeenCalled();
  });

  it("形式の誤った URL は 400 で、月の回数は数えない", async () => {
    const res = await sitePost(request("/api/site", { url: "ftp://example.com" }));
    expect(res.status).toBe(400);
    expect(monthly.checkFreeRun).not.toHaveBeenCalled();
    expect(monthly.recordFreeRun).not.toHaveBeenCalled();
  });

  it("本当にクロールしたときだけ 1 回数え、キャッシュ命中では数えない", async () => {
    const first = await sitePost(request("/api/site", { url: `${origin}/cache-test`, maxPages: 2 }));
    expect(first.status).toBe(200);
    await first.text();
    expect(monthly.recordFreeRun).toHaveBeenCalledTimes(1);
    expect(monthly.recordFreeRun).toHaveBeenCalledWith("free-site", `${origin}/cache-test`, expect.any(String));

    const second = await sitePost(request("/api/site", { url: `${origin}/cache-test`, maxPages: 2 }));
    expect(await second.text()).toContain('"cached":true');
    expect(monthly.recordFreeRun).toHaveBeenCalledTimes(1);
  });

  it("月の上限に達していれば 429 で、クロールしない", async () => {
    monthly.checkFreeRun.mockResolvedValue(Response.json({ code: "free_monthly" }, { status: 429 }));
    const res = await sitePost(request("/api/site", { url: `${origin}/over`, maxPages: 2 }));
    expect(res.status).toBe(429);
    expect(monthly.recordFreeRun).not.toHaveBeenCalled();
  });

  it("混雑しているときは 429 で、月の回数は数えない", async () => {
    const hold = acquireCrawlSlot("site", "busy-client");
    try {
      const res = await sitePost(request("/api/site", { url: `${origin}/busy`, maxPages: 2 }, { "x-forwarded-for": "busy-client" }));
      expect(res.status).toBe(429);
      expect(monthly.recordFreeRun).not.toHaveBeenCalled();
    } finally {
      hold?.();
    }
  });
});

describe("/api/analyze の入口", () => {
  it("専用ログインが無ければ 401", async () => {
    access.requireFreeAccess.mockResolvedValue(Response.json({ code: "free_login" }, { status: 401 }));
    const res = await analyzePost(request("/api/analyze", { url: `${origin}/` }));
    expect(res.status).toBe(401);
  });

  it("形式の誤った URL・内部ネットワークは 400 で、月の回数は数えない", async () => {
    const bad = await analyzePost(request("/api/analyze", { url: "ftp://example.com" }));
    expect(bad.status).toBe(400);
    delete process.env.ALLOW_PRIVATE_HOSTS;
    try {
      const blocked = await analyzePost(request("/api/analyze", { url: "http://127.0.0.1:1/" }));
      expect(blocked.status).toBe(400);
    } finally {
      process.env.ALLOW_PRIVATE_HOSTS = "1";
    }
    expect(monthly.recordFreeRun).not.toHaveBeenCalled();
  });

  it("キャッシュのキーはパスの大文字小文字を区別する", async () => {
    const upper = await analyzePost(request("/api/analyze", { url: `${origin}/About` }));
    expect((await upper.json()).result.page.finalUrl).toContain("/About");
    const lower = await analyzePost(request("/api/analyze", { url: `${origin}/about` }));
    const body = await lower.json();
    expect(body.cached).toBe(false);
    expect(body.result.page.finalUrl).toContain("/about");
    expect(monthly.recordFreeRun).toHaveBeenCalledTimes(2);
  });
});
