/**
 * 実費の出る機能の月の回数（takeUsage）を、URL の検査より後に数える（2026-09-23）。
 *
 * 以前は HP 改修提案と FAQ 提案が回数を数えてから生成の中で URL を検査し、形式の誤った URL
 * （invalid_url）を 502 で返していた。ページ診断も回数を数えてから検索（実費）まで進んでいた。
 * 認証・回数・AI の鍵は差し替え、ネットワークには出ない。
 */
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  takeUsage: vi.fn(async () => null as Response | null),
  proposeFaq: vi.fn(),
  generateImprovement: vi.fn(),
  runDiagnosis: vi.fn(),
}));
vi.mock("@/lib/usage/gate", () => ({ takeUsage: mocks.takeUsage }));
vi.mock("@/lib/auth/guard", () => ({ requireAuth: async () => null }));
vi.mock("@/lib/auth/user", () => ({ currentUserId: async () => "user-1" }));
vi.mock("@/lib/karte/server", () => ({ currentKarteBrief: async () => "" }));
vi.mock("@/lib/llm/anthropic", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/llm/anthropic")>()),
  isAnthropicEnabled: () => true,
}));
vi.mock("@/lib/faq/propose", () => ({ proposeFaq: mocks.proposeFaq }));
vi.mock("@/lib/improvement/generate", () => ({ generateImprovement: mocks.generateImprovement }));
vi.mock("@/lib/page-diagnosis/run", () => ({ runDiagnosis: mocks.runDiagnosis }));
vi.mock("@/lib/serp", () => ({ getSerpProvider: () => null }));

import { POST as improvementPost } from "@/app/api/improvement/route";
import { POST as proposePost } from "@/app/api/faq/propose/route";
import { POST as diagnosisPost } from "@/app/api/page-diagnosis/route";

const request = (path: string, body: unknown) =>
  new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  for (const m of Object.values(mocks)) m.mockClear();
});

describe.each([
  ["HP 改修提案", "/api/improvement", improvementPost, (url: string) => ({ url })],
  ["FAQ 提案", "/api/faq/propose", proposePost, (url: string) => ({ url })],
  ["ページ診断", "/api/page-diagnosis", diagnosisPost, (url: string) => ({ keyword: "kw", url })],
])("%s", (_label, path, post, bodyOf) => {
  it("形式の誤った URL は回数を数えずに 400（502 にしない）", async () => {
    const res = await post(request(path, bodyOf("ftp://example.com/")));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "invalid_url" });
    expect(mocks.takeUsage).not.toHaveBeenCalled();
  });

  it("内部ネットワークの URL も回数を数えずに 400", async () => {
    const res = await post(request(path, bodyOf("http://169.254.169.254/latest/meta-data/")));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "blocked_host" });
    expect(mocks.takeUsage).not.toHaveBeenCalled();
  });
});
