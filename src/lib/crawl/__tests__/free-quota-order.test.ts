/**
 * 無料診断の回数を「本当に診断するときだけ」消費する（2026-09-23）。
 *
 * 以前は /api/site が URL の検査・キャッシュ・混雑（429）より前に consumeFreeRun を呼び、
 * /api/analyze も URL の検査より前に呼んでいたため、形式の誤り・キャッシュ命中・429 でも
 * 2 回しかない無料枠が減っていた（free/quota.ts は「キャッシュに当たった診断では呼ばない」約束）。
 * 回数の仕組みそのもの（Clerk のメタデータ）は差し替えて、呼ばれた回数だけを数える。
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const quota = vi.hoisted(() => ({
  consumeFreeRun: vi.fn(async () => null as Response | null),
  requireFreeUser: vi.fn(async () => null as Response | null),
}));
vi.mock("@/lib/free/quota", () => quota);

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
  quota.consumeFreeRun.mockClear();
});

const request = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

describe("/api/site の回数の消費", () => {
  it("形式の誤った URL では消費しない", async () => {
    const res = await sitePost(request("/api/site", { url: "ftp://example.com" }));
    expect(res.status).toBe(400);
    expect(quota.consumeFreeRun).not.toHaveBeenCalled();
  });

  it("本当にクロールしたときだけ 1 回、キャッシュ命中では消費しない", async () => {
    const first = await sitePost(request("/api/site", { url: `${origin}/cache-test`, maxPages: 2 }));
    expect(first.status).toBe(200);
    await first.text();
    expect(quota.consumeFreeRun).toHaveBeenCalledTimes(1);

    const second = await sitePost(request("/api/site", { url: `${origin}/cache-test`, maxPages: 2 }));
    expect(await second.text()).toContain('"cached":true');
    expect(quota.consumeFreeRun).toHaveBeenCalledTimes(1);
  });

  it("混雑（429）では消費しない", async () => {
    const hold = acquireCrawlSlot("site", "busy-client");
    try {
      const res = await sitePost(request("/api/site", { url: `${origin}/busy`, maxPages: 2 }, { "x-forwarded-for": "busy-client" }));
      expect(res.status).toBe(429);
      expect(quota.consumeFreeRun).not.toHaveBeenCalled();
    } finally {
      hold?.();
    }
  });
});

describe("/api/analyze の回数の消費", () => {
  it("形式の誤った URL・内部ネットワークでは消費しない", async () => {
    const bad = await analyzePost(request("/api/analyze", { url: "ftp://example.com" }));
    expect(bad.status).toBe(400);
    delete process.env.ALLOW_PRIVATE_HOSTS;
    try {
      const blocked = await analyzePost(request("/api/analyze", { url: "http://127.0.0.1:1/" }));
      expect(blocked.status).toBe(400);
    } finally {
      process.env.ALLOW_PRIVATE_HOSTS = "1";
    }
    expect(quota.consumeFreeRun).not.toHaveBeenCalled();
  });

  it("キャッシュのキーはパスの大文字小文字を区別する", async () => {
    const upper = await analyzePost(request("/api/analyze", { url: `${origin}/About` }));
    expect((await upper.json()).result.page.finalUrl).toContain("/About");
    const lower = await analyzePost(request("/api/analyze", { url: `${origin}/about` }));
    const body = await lower.json();
    expect(body.cached).toBe(false);
    expect(body.result.page.finalUrl).toContain("/about");
    expect(quota.consumeFreeRun).toHaveBeenCalledTimes(2);
  });
});
