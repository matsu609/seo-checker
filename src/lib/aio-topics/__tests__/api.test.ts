/**
 * POST /api/aio-topics と /api/aio-topics/coverage の入口（ネットワークには出ない）。
 * 連携が無い環境で 503 と必要な環境変数名を返すことを確かめる。
 */
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as coveragePost } from "@/app/api/aio-topics/coverage/route";
import { POST as topicsPost } from "@/app/api/aio-topics/route";

const originalSerp = process.env.SERPAPI_KEY;
const originalAnthropic = process.env.ANTHROPIC_API_KEY;

function request(path: string, body: unknown, raw?: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ?? JSON.stringify(body),
  });
}

beforeEach(() => {
  delete process.env.SERPAPI_KEY;
  delete process.env.ANTHROPIC_API_KEY;
});

afterEach(() => {
  if (originalSerp === undefined) delete process.env.SERPAPI_KEY;
  else process.env.SERPAPI_KEY = originalSerp;
  if (originalAnthropic === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = originalAnthropic;
});

describe("POST /api/aio-topics", () => {
  it("両方の鍵が無ければ 503 で 2 つの環境変数名を伝える", async () => {
    const res = await topicsPost(request("/api/aio-topics", { keyword: "AIO 対策" }));
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("SERPAPI_KEY");
    expect(body.error).toContain("ANTHROPIC_API_KEY");
  });

  it("SERPAPI_KEY だけあれば ANTHROPIC_API_KEY を求める", async () => {
    process.env.SERPAPI_KEY = "test-key";
    const res = await topicsPost(request("/api/aio-topics", { keyword: "AIO 対策" }));
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("ANTHROPIC_API_KEY");
    expect(body.error).not.toContain("SERPAPI_KEY");
  });

  it("鍵が揃っていれば入力検証まで進む（400 / 422）", async () => {
    process.env.SERPAPI_KEY = "test-key";
    process.env.ANTHROPIC_API_KEY = "test-key";
    expect((await topicsPost(request("/api/aio-topics", null, "{"))).status).toBe(400);
    expect((await topicsPost(request("/api/aio-topics", { keyword: "" }))).status).toBe(422);
    expect((await topicsPost(request("/api/aio-topics", { keyword: "   " }))).status).toBe(422);
  });
});

describe("POST /api/aio-topics/coverage", () => {
  it("ANTHROPIC_API_KEY が無ければ 503", async () => {
    const res = await coveragePost(
      request("/api/aio-topics/coverage", { keyword: "k", pageUrl: "https://example.com/", topics: ["A"] }),
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("ANTHROPIC_API_KEY");
  });

  it("鍵があれば入力検証まで進む", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    expect((await coveragePost(request("/api/aio-topics/coverage", null, "{"))).status).toBe(400);
    expect(
      (await coveragePost(request("/api/aio-topics/coverage", { keyword: "k", pageUrl: "https://example.com/", topics: [] })))
        .status,
    ).toBe(422);
  });
});
