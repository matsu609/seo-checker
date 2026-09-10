/**
 * Supabase の薄いクライアントのテスト。
 * 「未設定なら not_configured」「キーはヘッダにだけ載る」「エラー本文を画面に流さない」を見る。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { DbError, dbErrorResponse, isSupabaseConfigured, normalizeSupabaseUrl, supabaseAuthHeaders, supabaseRest } from "../supabase";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function configure(key = "eyJ.service-role.jwt") {
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co/");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", key);
}

describe("URL と鍵の形式", () => {
  it("Data API 画面からコピーした /rest/v1/ 付きの URL でも二重にならない", () => {
    expect(normalizeSupabaseUrl("https://x.supabase.co")).toBe("https://x.supabase.co");
    expect(normalizeSupabaseUrl("https://x.supabase.co/")).toBe("https://x.supabase.co");
    expect(normalizeSupabaseUrl("https://x.supabase.co/rest/v1/")).toBe("https://x.supabase.co");
    expect(normalizeSupabaseUrl("  https://x.supabase.co/rest/v1 ")).toBe("https://x.supabase.co");
  });

  it("従来の JWT は Bearer にも載せ、新しい sb_secret_ は apikey だけ", () => {
    expect(supabaseAuthHeaders("eyJabc")).toEqual({ apikey: "eyJabc", authorization: "Bearer eyJabc" });
    expect(supabaseAuthHeaders("sb_secret_abc")).toEqual({ apikey: "sb_secret_abc" });
  });

  it("URL に /rest/v1/ が付いていても正しい場所を叩く", async () => {
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co/rest/v1/");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_abc");
    const fetchMock = vi.fn(async () => Response.json([]));
    vi.stubGlobal("fetch", fetchMock);
    await supabaseRest("meo_reports");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://example.supabase.co/rest/v1/meo_reports");
    expect((init.headers as Record<string, string>).authorization).toBeUndefined();
  });
});

describe("設定の有無", () => {
  it("両方そろって初めて有効", () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    expect(isSupabaseConfigured()).toBe(false);
    vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
    expect(isSupabaseConfigured()).toBe(false);
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "k");
    expect(isSupabaseConfigured()).toBe(true);
  });

  it("未設定で叩くと not_configured（fetch は呼ばない）", async () => {
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(supabaseRest("meo_reports")).rejects.toMatchObject({ code: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("リクエストの形", () => {
  it("URL・ヘッダ・本文を PostgREST の形で送る", async () => {
    configure();
    const fetchMock = vi.fn(async () => Response.json([{ id: "1" }], { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const rows = await supabaseRest("meo_reports?select=id", {
      method: "POST",
      body: { a: 1 },
      prefer: "return=representation",
    });
    expect(rows).toEqual([{ id: "1" }]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://example.supabase.co/rest/v1/meo_reports?select=id");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.apikey).toBe("eyJ.service-role.jwt");
    expect(headers.authorization).toBe("Bearer eyJ.service-role.jwt");
    expect(headers.prefer).toBe("return=representation");
    expect(headers["content-type"]).toBe("application/json");
    expect(init.body).toBe('{"a":1}');
  });

  it("GET は本文も content-type も付けない", async () => {
    configure();
    const fetchMock = vi.fn(async () => Response.json([]));
    vi.stubGlobal("fetch", fetchMock);
    await supabaseRest("meo_reports");
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("GET");
    expect(init.body).toBeUndefined();
    expect((init.headers as Record<string, string>)["content-type"]).toBeUndefined();
  });
});

describe("エラー", () => {
  it("HTTP エラーは upstream。本文（SQL やテーブル名）は流さない", async () => {
    configure();
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ message: 'relation "meo_reports" does not exist' }, { status: 500 })));
    const err = await supabaseRest("meo_reports").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DbError);
    expect((err as DbError).code).toBe("upstream");
    expect((err as DbError).message).not.toContain("relation");
  });

  it("404 はテーブル未作成の案内にする", async () => {
    configure();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));
    await expect(supabaseRest("meo_reports")).rejects.toThrow("SQL");
  });

  it("接続失敗も upstream", async () => {
    configure();
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("fetch failed");
    }));
    await expect(supabaseRest("meo_reports")).rejects.toMatchObject({ code: "upstream" });
  });

  it("API 応答のステータスはコードごとに決まる", async () => {
    expect(dbErrorResponse(new DbError("not_configured", "x")).status).toBe(503);
    expect(dbErrorResponse(new DbError("upstream", "x")).status).toBe(502);
    expect(dbErrorResponse(new DbError("invalid", "x")).status).toBe(400);
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(dbErrorResponse(new Error("boom")).status).toBe(502);
    spy.mockRestore();
  });
});
