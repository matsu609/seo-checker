/**
 * /api/writing/* の入口（ネットワークには出ない）。
 * 連携が無い環境で 503 と必要な環境変数名を返すこと、入力検証が効くことを確かめる。
 */
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as bodyPost } from "@/app/api/writing/body/route";
import { POST as checkPost } from "@/app/api/writing/check/route";
import { POST as outlinePost } from "@/app/api/writing/outline/route";
import { POST as planPost } from "@/app/api/writing/plan/route";
import { POST as rewritePost } from "@/app/api/writing/rewrite/route";

const originalAnthropic = process.env.ANTHROPIC_API_KEY;
const originalSerp = process.env.SERPAPI_KEY;

function request(path: string, body: unknown, raw?: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ?? JSON.stringify(body),
  });
}

const outline = {
  search_intent: "意図",
  audience: "読者",
  common_topics: [],
  missing_topics: [],
  title_suggestions: [],
  description_suggestions: [],
  outline: [{ h2: "見出し", h3: [], goal: "狙い", target_chars: 600 }],
};

async function errorOf(res: Response): Promise<string> {
  const body = (await res.json()) as { error?: string };
  return body.error ?? "";
}

beforeEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.SERPAPI_KEY;
});

afterEach(() => {
  if (originalAnthropic === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = originalAnthropic;
  if (originalSerp === undefined) delete process.env.SERPAPI_KEY;
  else process.env.SERPAPI_KEY = originalSerp;
});

describe("鍵が無いとき（縮退動作）", () => {
  it("構成案・本文・企画書・リライトは 503 で ANTHROPIC_API_KEY を伝える", async () => {
    const responses = await Promise.all([
      outlinePost(request("/api/writing/outline", { keyword: "AIO 対策" })),
      bodyPost(request("/api/writing/body", { keyword: "k", outline })),
      planPost(request("/api/writing/plan", { content: "内容" })),
      rewritePost(request("/api/writing/rewrite", { target: "本文", instruction: "校正して" })),
    ]);
    for (const res of responses) {
      expect(res.status).toBe(503);
      expect(await errorOf(res)).toContain("ANTHROPIC_API_KEY");
    }
  });

  it("ファクト・コピペチェックは 503、薬機法チェックは辞書だけで動く", async () => {
    for (const kind of ["fact", "copy"]) {
      const res = await checkPost(request("/api/writing/check", { kind, markdown: "本文" }));
      expect(res.status).toBe(503);
      expect(await errorOf(res)).toContain("ANTHROPIC_API_KEY");
    }

    const res = await checkPost(
      request("/api/writing/check", { kind: "yakki", markdown: "この化粧品でシミが治ります。" }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: { kind: string; issues: unknown[]; model: string | null } };
    expect(body.result.kind).toBe("yakki");
    expect(body.result.model).toBeNull();
    expect(body.result.issues.length).toBeGreaterThan(0);
  });
});

describe("入力検証（鍵あり）", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  it("壊れた JSON は 400", async () => {
    expect((await outlinePost(request("/api/writing/outline", null, "{"))).status).toBe(400);
    expect((await bodyPost(request("/api/writing/body", null, "{"))).status).toBe(400);
    expect((await planPost(request("/api/writing/plan", null, "{"))).status).toBe(400);
    expect((await rewritePost(request("/api/writing/rewrite", null, "{"))).status).toBe(400);
    expect((await checkPost(request("/api/writing/check", null, "{"))).status).toBe(400);
  });

  it("構成案: キーワードが空なら 422", async () => {
    expect((await outlinePost(request("/api/writing/outline", { keyword: "" }))).status).toBe(422);
    expect((await outlinePost(request("/api/writing/outline", { keyword: "   " }))).status).toBe(422);
  });

  it("本文: 構成案が無い・見出しが空なら 422", async () => {
    expect((await bodyPost(request("/api/writing/body", { keyword: "k" }))).status).toBe(422);
    const empty = await bodyPost(
      request("/api/writing/body", { keyword: "k", outline: { ...outline, outline: [] } }),
    );
    expect(empty.status).toBe(422);
    expect(await errorOf(empty)).toContain("見出し");
  });

  it("本文: 見出しが多すぎれば 422", async () => {
    const many = {
      ...outline,
      outline: Array.from({ length: 20 }, (_, i) => ({ h2: `見出し${i}`, h3: [], goal: "", target_chars: 600 })),
    };
    const res = await bodyPost(request("/api/writing/body", { keyword: "k", outline: many }));
    expect(res.status).toBe(422);
  });

  it("企画書: 内容が空 / 1,000 文字超なら 422", async () => {
    expect((await planPost(request("/api/writing/plan", { content: "" }))).status).toBe(422);
    expect((await planPost(request("/api/writing/plan", { content: "あ".repeat(1_001) }))).status).toBe(422);
  });

  it("企画書: PDF 以外のファイルは 415、5MB 超は 413", async () => {
    const png = await planPost(
      request("/api/writing/plan", {
        content: "内容",
        pdf: { name: "画像.png", mediaType: "image/png", data: "iVBORw0KGgo=" },
      }),
    );
    expect(png.status).toBe(415);

    const oversize = await planPost(
      request("/api/writing/plan", {
        content: "内容",
        pdf: { name: "大きい.pdf", mediaType: "application/pdf", data: `JVBERi0${"A".repeat(7_000_100)}` },
      }),
    );
    expect(oversize.status).toBe(413);
  });

  it("リライト: 本文か指示が空なら 422", async () => {
    expect((await rewritePost(request("/api/writing/rewrite", { target: "", instruction: "校正して" }))).status).toBe(422);
    expect((await rewritePost(request("/api/writing/rewrite", { target: "本文", instruction: "" }))).status).toBe(422);
  });

  it("チェック: 種類が不正なら 422", async () => {
    expect((await checkPost(request("/api/writing/check", { kind: "unknown", markdown: "本文" }))).status).toBe(422);
    expect((await checkPost(request("/api/writing/check", { kind: "fact", markdown: "" }))).status).toBe(422);
  });
});
