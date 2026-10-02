/**
 * /api/site と /api/analyze の入口の順番。
 *
 * 2026-10-02 から無料診断は専用ログイン（src/lib/free/access.ts）だけで守り、1 人あたりの回数制限は無い。
 * ここでは「専用ログインの確認が必ず最初に来る（401 なら何もしない）」ことと、
 * 通ったあとの URL の検査・キャッシュ・混雑（429）の振る舞いが変わっていないことを見る。
 * 専用ログインの判定は差し替えて、呼ばれた回数だけを数える。
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const access = vi.hoisted(() => ({
  requireFreeAccess: vi.fn(async () => null as Response | null),
}));
vi.mock("@/lib/free/access", () => access);

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
  });

  it("形式の誤った URL は 400", async () => {
    const res = await sitePost(request("/api/site", { url: "ftp://example.com" }));
    expect(res.status).toBe(400);
    expect(access.requireFreeAccess).toHaveBeenCalledTimes(1);
  });

  it("2 回目はキャッシュ命中（回数制限は無いので何度でも通る）", async () => {
    const first = await sitePost(request("/api/site", { url: `${origin}/cache-test`, maxPages: 2 }));
    expect(first.status).toBe(200);
    await first.text();

    const second = await sitePost(request("/api/site", { url: `${origin}/cache-test`, maxPages: 2 }));
    expect(await second.text()).toContain('"cached":true');
    expect(access.requireFreeAccess).toHaveBeenCalledTimes(2);
  });

  it("混雑しているときは 429", async () => {
    const hold = acquireCrawlSlot("site", "busy-client");
    try {
      const res = await sitePost(request("/api/site", { url: `${origin}/busy`, maxPages: 2 }, { "x-forwarded-for": "busy-client" }));
      expect(res.status).toBe(429);
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

  it("形式の誤った URL・内部ネットワークは 400", async () => {
    const bad = await analyzePost(request("/api/analyze", { url: "ftp://example.com" }));
    expect(bad.status).toBe(400);
    delete process.env.ALLOW_PRIVATE_HOSTS;
    try {
      const blocked = await analyzePost(request("/api/analyze", { url: "http://127.0.0.1:1/" }));
      expect(blocked.status).toBe(400);
    } finally {
      process.env.ALLOW_PRIVATE_HOSTS = "1";
    }
  });

  it("キャッシュのキーはパスの大文字小文字を区別する", async () => {
    const upper = await analyzePost(request("/api/analyze", { url: `${origin}/About` }));
    expect((await upper.json()).result.page.finalUrl).toContain("/About");
    const lower = await analyzePost(request("/api/analyze", { url: `${origin}/about` }));
    const body = await lower.json();
    expect(body.cached).toBe(false);
    expect(body.result.page.finalUrl).toContain("/about");
  });
});
