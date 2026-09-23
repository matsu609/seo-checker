/**
 * 代理ログイン中に Google へ書き込ませない（2026-09-23）。
 *
 * 代理ログインは「見るための機能」。口コミへの返信・投稿の送信と予約・基本情報の送信は、
 * お客様の名前で Google に公開されるので 403 で塞ぐ。下書き・取り消しは塞がない。
 * ルートをそのまま呼び、Google にも DB にも書き込みが出ないことを fetch の記録で確かめる。
 */
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const impersonating = vi.fn(async () => true);
vi.mock("@/lib/admin/impersonate", () => ({ isImpersonating: () => impersonating() }));
vi.mock("@/lib/auth/guard", () => ({ requireAuth: async () => null, requireUser: async () => "user_1" }));

const POST_ID = "0b2f0b8e-0000-4000-8000-000000000001";
const ROW = {
  id: POST_ID,
  user_id: "user_1",
  place_id: "ChIJ0000000000",
  location_name: "accounts/1/locations/2",
  topic_type: "STANDARD",
  title: "保存済みの題名",
  summary: "保存済みの本文",
  cta_type: "NONE",
  cta_url: "",
  event_start: null,
  event_end: null,
  status: "draft",
  scheduled_at: "2026-10-01T01:00:00Z",
  published_at: null,
  google_name: null,
  error: null,
  created_at: "2026-09-20T00:00:00Z",
  updated_at: "2026-09-20T00:00:00Z",
};

let fetchMock: ReturnType<typeof vi.fn>;
const writes = () => fetchMock.mock.calls.filter((c) => ((c[1] as RequestInit | undefined)?.method ?? "GET") !== "GET");

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_x");
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_x");
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_x");
  impersonating.mockResolvedValue(true);
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes("gbp_posts") && (init?.method ?? "GET") === "GET") return Response.json([ROW]);
    if (url.includes("gbp_posts") && init?.method === "PATCH") return Response.json([{ ...ROW, ...(JSON.parse(init.body as string) as object) }]);
    return Response.json([]);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function req(url: string, method: string, body?: unknown): NextRequest {
  return new NextRequest(`http://localhost${url}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
}
const ctx = { params: Promise.resolve({ id: POST_ID }) };

async function expectBlocked(res: Response, action: string) {
  expect(res.status).toBe(403);
  const body = (await res.json()) as { error: string; code: string };
  expect(body.code).toBe("impersonating");
  expect(body.error).toContain(`代理ログイン中は${action}ができません`);
}

describe("代理ログイン中は Google への書き込みを塞ぐ", () => {
  it("口コミへの返信の投稿・削除", async () => {
    const { PUT, DELETE } = await import("@/app/api/replies/reply/route");
    const reviewName = "accounts/1/locations/2/reviews/abc";
    await expectBlocked(await PUT(req("/api/replies/reply", "PUT", { reviewName, comment: "ありがとうございます" })), "口コミへの返信の投稿");
    await expectBlocked(await DELETE(req("/api/replies/reply", "DELETE", { reviewName })), "口コミへの返信の削除");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("今すぐ投稿", async () => {
    const { POST } = await import("@/app/api/posts/[id]/publish/route");
    await expectBlocked(await POST(req(`/api/posts/${POST_ID}/publish`, "POST"), ctx), "Google への投稿");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("予約つきの作成・承認して予約は塞ぎ、下書きの作成は通す", async () => {
    const { POST } = await import("@/app/api/posts/route");
    const input = { placeId: "ChIJ0000000000", topicType: "STANDARD", summary: "本文" };
    await expectBlocked(await POST(req("/api/posts", "POST", { ...input, scheduledAt: "2026-10-01T01:00:00+09:00" })), "投稿の予約");
    // 下書き（予約日時なし）はガードを通る（この店舗は未登録なので 404）
    const draft = await POST(req("/api/posts", "POST", input));
    expect(draft.status).toBe(404);

    const { PATCH } = await import("@/app/api/posts/[id]/route");
    await expectBlocked(await PATCH(req(`/api/posts/${POST_ID}`, "PATCH", { action: "schedule" }), ctx), "投稿の予約");
    expect(writes()).toHaveLength(0);
  });

  it("予約済みの投稿の中身の変更も塞ぐ（定期処理がお客様の名前で送るため）", async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) => ((init?.method ?? "GET") === "GET" ? Response.json([{ ...ROW, status: "scheduled" }]) : Response.json([])));
    const { PATCH } = await import("@/app/api/posts/[id]/route");
    await expectBlocked(await PATCH(req(`/api/posts/${POST_ID}`, "PATCH", { summary: "代理で書いた本文" }), ctx), "投稿の予約");
    expect(writes()).toHaveLength(0);
  });

  it("取り消しは塞がない。送った項目（状態）だけを書き換え、保存済みの題名・本文は消さない", async () => {
    const { PATCH } = await import("@/app/api/posts/[id]/route");
    const res = await PATCH(req(`/api/posts/${POST_ID}`, "PATCH", { action: "cancel" }), ctx);
    expect(res.status).toBe(200);
    const [, init] = writes()[0]! as [string, RequestInit];
    const body = JSON.parse(init.body as string) as Record<string, unknown>;
    expect(body.status).toBe("cancelled");
    // 2026-09-23 まで partial() の既定値で title / summary / scheduled_at などが空で上書きされていた
    expect(Object.keys(body).sort()).toEqual(["status", "updated_at"]);
  });
});

describe("塞がないとき", () => {
  it("代理中でなければ null。ログインの無い環境では代理の判定そのものをしない", async () => {
    const { blockGoogleWriteWhileImpersonating } = await import("../write-guard");
    impersonating.mockResolvedValue(false);
    await expect(blockGoogleWriteWhileImpersonating("x")).resolves.toBeNull();
    impersonating.mockClear();
    vi.stubEnv("CLERK_SECRET_KEY", "");
    await expect(blockGoogleWriteWhileImpersonating("x")).resolves.toBeNull();
    expect(impersonating).not.toHaveBeenCalled();
  });
});
