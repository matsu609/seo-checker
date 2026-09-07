/**
 * POST /api/llmo/run と /api/prompt-expansion の入口（ネットワークには出ない）。
 * 連携が無い環境で 503 と必要な環境変数名を返すこと、入力検証が効くことを確かめる。
 */
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as llmoPost } from "@/app/api/llmo/run/route";
import { POST as expansionPost } from "@/app/api/prompt-expansion/route";
import { MAX_CALLS_PER_REQUEST } from "@/lib/llmo/types";

const KEYS = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "PERPLEXITY_API_KEY"] as const;
const original = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));

function request(path: string, body: unknown, raw?: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ?? JSON.stringify(body),
  });
}

beforeEach(() => {
  for (const k of KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of KEYS) {
    const v = original[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("POST /api/llmo/run", () => {
  it("鍵が無ければ 503 で必要な環境変数名を伝える", async () => {
    const res = await llmoPost(request("/api/llmo/run", { prompts: ["質問"], models: ["claude"] }));
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("ANTHROPIC_API_KEY");
  });

  it("選んだモデル分の環境変数名を並べる", async () => {
    const res = await llmoPost(request("/api/llmo/run", { prompts: ["質問"], models: ["openai", "gemini"] }));
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("OPENAI_API_KEY");
    expect(body.error).toContain("GEMINI_API_KEY");
    expect(body.error).not.toContain("ANTHROPIC_API_KEY");
  });

  it("JSON でなければ 400", async () => {
    const res = await llmoPost(request("/api/llmo/run", null, "{"));
    expect(res.status).toBe(400);
  });

  it("プロンプトが空なら 422", async () => {
    const res = await llmoPost(request("/api/llmo/run", { prompts: [], models: ["claude"] }));
    expect(res.status).toBe(422);
  });

  it("空白だけのプロンプトも 422", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const res = await llmoPost(request("/api/llmo/run", { prompts: ["   "], models: ["claude"] }));
    expect(res.status).toBe(422);
  });

  it("モデルが空なら 422", async () => {
    const res = await llmoPost(request("/api/llmo/run", { prompts: ["質問"], models: [] }));
    expect(res.status).toBe(422);
  });

  it("プロンプト × モデルが上限を超えたら 422 で件数を伝える", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    process.env.OPENAI_API_KEY = "test-key";
    const prompts = Array.from({ length: 21 }, (_, i) => `質問 ${i}`);
    const res = await llmoPost(request("/api/llmo/run", { prompts, models: ["claude", "openai"] }));
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain(String(MAX_CALLS_PER_REQUEST));
    expect(body.error).toContain("42");
  });

  it("未知のモデル名は 422（enum 検証）", async () => {
    const res = await llmoPost(request("/api/llmo/run", { prompts: ["質問"], models: ["grok"] }));
    expect(res.status).toBe(422);
  });
});

describe("POST /api/prompt-expansion", () => {
  it("ANTHROPIC_API_KEY が無ければ 503", async () => {
    const res = await expansionPost(
      request("/api/prompt-expansion", { seedPrompts: ["質問"], siteUrl: "https://example.co.jp/" }),
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("ANTHROPIC_API_KEY");
  });

  it("JSON でなければ 400", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const res = await expansionPost(request("/api/prompt-expansion", null, "{"));
    expect(res.status).toBe(400);
  });

  it("参考プロンプトが無ければ 422", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const res = await expansionPost(request("/api/prompt-expansion", { seedPrompts: [], siteUrl: "https://example.co.jp/" }));
    expect(res.status).toBe(422);
  });

  it("空白だけの参考プロンプトも 422", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const res = await expansionPost(
      request("/api/prompt-expansion", { seedPrompts: ["  "], siteUrl: "https://example.co.jp/" }),
    );
    expect(res.status).toBe(422);
  });

  it("対象サイト URL が無ければ 422", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const res = await expansionPost(request("/api/prompt-expansion", { seedPrompts: ["質問"] }));
    expect(res.status).toBe(422);
  });

  it("生成数が範囲外なら 422", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const res = await expansionPost(
      request("/api/prompt-expansion", { seedPrompts: ["質問"], siteUrl: "https://example.co.jp/", count: 5 }),
    );
    expect(res.status).toBe(422);
  });
});
