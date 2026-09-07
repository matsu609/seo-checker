/**
 * POST /api/rank/measure の入口だけを確かめる（ネットワークには出ない）。
 * SERPAPI_KEY が無い環境で 503 と日本語メッセージを返すことが degraded-mode の要。
 */
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/rank/measure/route";

const original = process.env.SERPAPI_KEY;

function request(body: unknown, raw?: string): NextRequest {
  return new NextRequest("http://localhost/api/rank/measure", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ?? JSON.stringify(body),
  });
}

beforeEach(() => {
  delete process.env.SERPAPI_KEY;
});

afterEach(() => {
  if (original === undefined) delete process.env.SERPAPI_KEY;
  else process.env.SERPAPI_KEY = original;
});

describe("POST /api/rank/measure", () => {
  it("SERPAPI_KEY が無ければ 503 で環境変数名を伝える", async () => {
    const res = await POST(request({ keywords: [{ keyword: "AIO 対策" }], projectDomain: "example.com" }));
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("SERPAPI_KEY");
  });

  it("JSON でなければ 400", async () => {
    process.env.SERPAPI_KEY = "test-key";
    const res = await POST(request(null, "{"));
    expect(res.status).toBe(400);
  });

  it("入力が不正なら 422（外部 API は呼ばない）", async () => {
    process.env.SERPAPI_KEY = "test-key";
    const res = await POST(request({ keywords: [], projectDomain: "example.com" }));
    expect(res.status).toBe(422);
    const res2 = await POST(request({ keywords: [{ keyword: "a" }] }));
    expect(res2.status).toBe(422);
  });

  it("空白だけのキーワードは 422", async () => {
    process.env.SERPAPI_KEY = "test-key";
    const res = await POST(request({ keywords: [{ keyword: "   " }], projectDomain: "example.com" }));
    expect(res.status).toBe(422);
  });
});
