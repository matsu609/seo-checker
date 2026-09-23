/**
 * 投稿の送信（2026-09-23）: 二重投稿を防ぐ「送る権利」の取り方と、送ったあとの記録の失敗の扱い。
 * Supabase は fetch の差し替え、Google は fetchImpl で受ける（ネットワークには出ない）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PostPatchInputSchema, PostInputSchema } from "../api";
import { ALREADY_CLAIMED_MESSAGE, PUBLISHED_MESSAGE, publishPost } from "../publish";
import { claimPost, listDuePosts } from "../store";
import type { GbpPost } from "../types";

const NOW = new Date("2026-09-23T20:00:00Z");

const ROW = {
  id: "0b2f0b8e-0000-4000-8000-000000000001",
  user_id: "user_1",
  place_id: "ChIJ0000000000",
  location_name: "accounts/1/locations/2",
  topic_type: "STANDARD",
  title: "",
  summary: "秋の新メニューが始まりました。",
  cta_type: "NONE",
  cta_url: "",
  event_start: null,
  event_end: null,
  status: "scheduled",
  scheduled_at: "2026-09-23T01:00:00Z",
  published_at: null,
  google_name: null,
  error: null,
  created_at: "2026-09-20T00:00:00Z",
  updated_at: "2026-09-20T00:00:00Z",
};

const POST: GbpPost = {
  id: ROW.id,
  placeId: ROW.place_id,
  locationName: ROW.location_name,
  topicType: "STANDARD",
  title: "",
  summary: ROW.summary,
  ctaType: "NONE",
  ctaUrl: "",
  eventStart: null,
  eventEnd: null,
  status: "scheduled",
  scheduledAt: ROW.scheduled_at,
  publishedAt: null,
  googleName: null,
  error: null,
  createdAt: ROW.created_at,
  updatedAt: ROW.updated_at,
};

let db: ReturnType<typeof vi.fn>;
const dbCalls = () => db.mock.calls.map((c) => ({ url: decodeURIComponent((c[0] as string).replace("https://example.supabase.co/rest/v1/", "")), init: c[1] as RequestInit }));
const bodyOf = (init: RequestInit) => JSON.parse(init.body as string) as Record<string, unknown>;

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_x");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Supabase の偽物。claim（status を publishing にする PATCH）に claimRows を返し、ほかの PATCH は patch で決める */
function fakeDb(options: { claimRows?: unknown[]; patch?: (body: Record<string, unknown>) => Response }) {
  db = vi.fn(async (_url: string, init?: RequestInit) => {
    const body = init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : {};
    if (init?.method === "PATCH" && body.status === "publishing") return Response.json(options.claimRows ?? [{ ...ROW, status: "publishing" }]);
    if (init?.method === "PATCH") return options.patch ? options.patch(body) : Response.json([{ ...ROW, ...body }]);
    return Response.json([]);
  });
  vi.stubGlobal("fetch", db);
}

const google = (status = 200) =>
  vi.fn(async () => (status === 200 ? Response.json({ name: "accounts/1/locations/2/localPosts/9", searchUrl: "https://g.co/x" }) : new Response("{}", { status }))) as unknown as typeof fetch;

describe("送る権利（claimPost）", () => {
  it("状態と予定時刻を条件にした 1 回の PATCH で「送信中」に変え、変えた行だけを返す", async () => {
    fakeDb({});
    const claimed = await claimPost("user_1", ROW.id, ["scheduled"], NOW, NOW);
    expect(claimed?.status).toBe("publishing");
    const [{ url, init }] = dbCalls();
    expect(init.method).toBe("PATCH");
    expect(url).toContain("user_id=eq.user_1");
    expect(url).toContain(`id=eq.${ROW.id}`);
    expect(url).toContain('status=in.("scheduled")');
    expect(url).toContain("scheduled_at=lte.2026-09-23T20:00:00.000Z");
    expect((init.headers as Record<string, string>).prefer).toBe("return=representation");
    expect(bodyOf(init)).toMatchObject({ status: "publishing", error: null });
  });

  it("先に取られていれば null（行が返らない）", async () => {
    fakeDb({ claimRows: [] });
    await expect(claimPost("user_1", ROW.id, ["scheduled"], NOW)).resolves.toBeNull();
  });

  it("対象外の利用者を除いて読める（定期処理の枠を埋めさせない）", async () => {
    fakeDb({});
    await listDuePosts(NOW, 200, ["gone_1", "gone_2"]);
    expect(dbCalls()[0]!.url).toContain('user_id=not.in.("gone_1","gone_2")');
  });
});

describe("publishPost", () => {
  it("権利を取れなければ Google に送らない（二重投稿にしない）", async () => {
    fakeDb({ claimRows: [] });
    const fetchImpl = google();
    const outcome = await publishPost("user_1", POST, { fetchImpl, getToken: async () => "tok", now: NOW });
    expect(outcome).toMatchObject({ ok: false, skipped: true, message: ALREADY_CLAIMED_MESSAGE });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(dbCalls()).toHaveLength(1);
  });

  it("権利を取った時点の内容で送り、投稿済みにする", async () => {
    fakeDb({ claimRows: [{ ...ROW, status: "publishing", summary: "直前に直した本文" }] });
    const fetchImpl = google();
    const outcome = await publishPost("user_1", POST, { fetchImpl, getToken: async () => "tok", now: NOW });
    expect(outcome).toMatchObject({ ok: true, message: PUBLISHED_MESSAGE });
    expect(JSON.parse(((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![1] as RequestInit).body as string).summary).toBe("直前に直した本文");
    const last = dbCalls().at(-1)!;
    expect(bodyOf(last.init)).toMatchObject({ status: "published", google_name: "accounts/1/locations/2/localPosts/9" });
  });

  it("ビジネスを探す呼び出しと投稿の呼び出しで、トークンは 1 回だけ取る", async () => {
    fakeDb({ claimRows: [{ ...ROW, status: "publishing", location_name: null }] });
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.includes("/accounts?")) return Response.json({ accounts: [{ name: "accounts/1" }] });
      if (url.includes("/locations?")) return Response.json({ locations: [{ name: "locations/2", title: "本店", metadata: { placeId: ROW.place_id } }] });
      return Response.json({ name: "accounts/1/locations/2/localPosts/9" });
    }) as unknown as typeof fetch;
    const getToken = vi.fn(async () => "tok");
    const outcome = await publishPost("user_1", { ...POST, locationName: null }, { fetchImpl, getToken, now: NOW });
    expect(outcome.ok).toBe(true);
    expect(outcome.post.locationName).toBe("accounts/1/locations/2");
    expect(getToken).toHaveBeenCalledTimes(1);
  });

  it("Google には送れたが記録の保存に失敗しても「失敗」に戻さない（戻すと次の押下で 2 回目が出る）", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fakeDb({ patch: () => new Response("", { status: 500 }) });
    const fetchImpl = google();
    const outcome = await publishPost("user_1", POST, { fetchImpl, getToken: async () => "tok", now: NOW });
    expect(outcome.ok).toBe(true);
    expect(outcome.post.status).toBe("published");
    // 「失敗」にする PATCH は出していない
    expect(dbCalls().some((c) => c.init.body && bodyOf(c.init).status === "failed")).toBe(false);
  });

  it("Google が拒否したら失敗にして理由を残す。記録にも失敗したら例外は投げずに返す", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    fakeDb({});
    const outcome = await publishPost("user_1", POST, { fetchImpl: google(403), getToken: async () => "tok", now: NOW });
    expect(outcome.ok).toBe(false);
    expect(outcome.message).toContain("利用申請");
    expect(bodyOf(dbCalls().at(-1)!.init)).toMatchObject({ status: "failed" });

    fakeDb({ patch: () => new Response("", { status: 500 }) });
    const quiet = await publishPost("user_1", POST, { fetchImpl: google(403), getToken: async () => "tok", now: NOW });
    expect(quiet).toMatchObject({ ok: false, post: { status: "failed" } });
  });
});

describe("編集の入力（2026-09-23）", () => {
  it("編集用のスキーマは送られてきた項目だけを返す（既定値で保存済みの内容を消さない）", () => {
    expect(PostPatchInputSchema.parse({})).toEqual({});
    expect(PostPatchInputSchema.parse({ title: "新しい題名" })).toEqual({ title: "新しい題名" });
    expect(PostPatchInputSchema.extend({}).safeParse({ summary: 1 }).success).toBe(false);
  });

  it("作成用のスキーマは今までどおり既定値で埋める", () => {
    expect(PostInputSchema.parse({ topicType: "STANDARD" })).toEqual({
      topicType: "STANDARD",
      title: "",
      summary: "",
      ctaType: "NONE",
      ctaUrl: "",
      eventStart: null,
      eventEnd: null,
      scheduledAt: null,
    });
  });
});
