/**
 * 問い合わせ URL の取り決め（リファクタリングの安全網）。
 *
 * 「外部から見た動作を変えない」ことを機械的に守るために、**各モジュールが組み立てる
 * PostgREST の URL を 1 文字単位で固定する**。リファクタリングの前に緑にしてから作業し、
 * 作業後も同じ文字列であることを確かめる。ここが落ちたら、どこかで問い合わせの意味が変わった。
 *
 * とくに守りたいのは 2 点:
 *   1. **すべての読み書きが `user_id=eq.<本人>` で絞られている**（他人の行に触れない）
 *   2. **値が `encodeURIComponent` で無害化されている**（`&` `=` `,` が潰れ、
 *      `order=` / `limit=` / `select=` を差し込めない = フィルタ注入が起きない）
 *
 * `eq()` は 2026-09-18 まで 8 ファイルに同じ実装が重複していた。1 か所に寄せる前に、
 * この 8 経路の URL をここで固定しておく。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** フィルタ注入を狙う文字を全部入れた利用者 ID */
const EVIL = 'user_1&select=*,x=eq.1.y*"%/ +#?';
/** 上を encodeURIComponent した期待値（テスト側でも一度だけ書く） */
const EVIL_ENC = encodeURIComponent(EVIL);

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "sb_secret_x");
  fetchMock = vi.fn(async () => Response.json([]));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

/** fetch に渡った URL のうち、Supabase の基点より後ろ（= 組み立てた問い合わせ） */
function query(i = 0): string {
  const url = fetchMock.mock.calls[i]![0] as string;
  return url.replace("https://example.supabase.co/rest/v1/", "");
}

describe("値の無害化（フィルタ注入が起きない）", () => {
  it("危険な文字は全部エスケープされ、区切り記号として働かない", () => {
    // ここが崩れると order= / limit= / select= を差し込めるようになる
    expect(EVIL_ENC).not.toContain("&");
    expect(EVIL_ENC).not.toContain("=");
    expect(EVIL_ENC).not.toContain(",");
    expect(EVIL_ENC).not.toContain('"');
    expect(EVIL_ENC).not.toContain("#");
    expect(EVIL_ENC).not.toContain("?");
    expect(EVIL_ENC).not.toContain("/");
    expect(EVIL_ENC).not.toContain(" ");
    expect(EVIL_ENC).not.toContain("+");
    expect(EVIL_ENC).not.toContain("%/");
  });
});

describe("フィルタの組み立て（eq / gte）", () => {
  it("eq は `eq.` + encodeURIComponent。gte は `gte.` + encodeURIComponent", async () => {
    const { eq, gte } = await import("../filters");
    expect(eq("user_1")).toBe("eq.user_1");
    expect(eq(EVIL)).toBe(`eq.${EVIL_ENC}`);
    expect(gte("2026-09-01T00:00:00.000Z")).toBe("gte.2026-09-01T00%3A00%3A00.000Z");
    expect(gte(EVIL)).toBe(`gte.${EVIL_ENC}`);
    // 自分自身を呼ぶ実装になっていないこと（再帰で落ちない）
    expect(() => gte("x")).not.toThrow();
  });

  it("lt / lte も同じ無害化（2026-09-23 に追加。それまでは手書きの lt. / lte. だった）", async () => {
    const { lt, lte } = await import("../filters");
    expect(lt("2026-09-01T00:00:00.000Z")).toBe("lt.2026-09-01T00%3A00%3A00.000Z");
    expect(lt(EVIL)).toBe(`lt.${EVIL_ENC}`);
    expect(lte(EVIL)).toBe(`lte.${EVIL_ENC}`);
  });

  it("inList は値を二重引用符で囲み、全体を無害化する（値の中の , で割れない）", async () => {
    const { inList, notInList } = await import("../filters");
    expect(inList(["a", "b"])).toBe(`in.${encodeURIComponent('("a","b")')}`);
    // 値の中の , ( ) は引用符の中に収まり、" と \ は \ でエスケープされる
    const tricky = ["x,y", 'q"z', "b\\s", "(p)"];
    expect(decodeURIComponent(inList(tricky).slice("in.".length))).toBe(String.raw`("x,y","q\"z","b\\s","(p)")`);
    const encoded = inList([EVIL]);
    expect(encoded).not.toContain("&");
    expect(encoded).not.toContain("=");
    expect(notInList(["u1"])).toBe(`not.in.${encodeURIComponent('("u1")')}`);
  });
});

describe("8 モジュールが組み立てる URL（1 文字も変えない）", () => {
  it("meo_stores: 一覧", async () => {
    const { listStores } = await import("@/lib/maps/stores");
    await listStores(EVIL);
    // 2026-09-23: 以前は limit=1200 の 1 回（Supabase は 1,000 行で切る）。1,000 行ずつ読み、並びは id で確定させる
    expect(query()).toBe(
      `meo_stores?select=id,user_id,place_id,place_name,own_place_id,created_at,last_refreshed_at&user_id=eq.${EVIL_ENC}&order=own_place_id.asc,created_at.asc,id.asc&limit=1000`,
    );
  });

  it("meo_reports: 一覧（店舗の絞り込みつき）", async () => {
    const { listMeoReports } = await import("@/lib/maps/history");
    await listMeoReports(EVIL, "ChIJ&evil");
    expect(query()).toContain(`&user_id=eq.${EVIL_ENC}`);
    expect(query()).toContain(`&place_id=eq.${encodeURIComponent("ChIJ&evil")}`);
    expect(query()).toContain("&order=generated_at.desc&limit=");
  });

  it("meo_owner_inputs: 1 件", async () => {
    const { getOwnerInput } = await import("@/lib/maps/owner-store");
    await getOwnerInput(EVIL, "ChIJ&evil");
    expect(query()).toBe(
      `meo_owner_inputs?select=user_id,place_id,input,updated_at&user_id=eq.${EVIL_ENC}&place_id=eq.${encodeURIComponent("ChIJ&evil")}&limit=1`,
    );
  });

  it("review_forms: 一覧", async () => {
    const { listForms } = await import("@/lib/reviews/forms");
    await listForms(EVIL);
    expect(query()).toContain(`&user_id=eq.${EVIL_ENC}&order=created_at.asc&limit=`);
  });

  it("review_responses: 一覧（アンケート単位）", async () => {
    const { listResponses } = await import("@/lib/reviews/responses");
    await listResponses("form&evil");
    expect(query()).toContain(`form_id=eq.${encodeURIComponent("form&evil")}`);
  });

  it("listing_profiles: 1 件", async () => {
    const { getListing } = await import("@/lib/listings/store");
    await getListing(EVIL, "ChIJ&evil");
    expect(query()).toContain(`&user_id=eq.${EVIL_ENC}&place_id=eq.${encodeURIComponent("ChIJ&evil")}&limit=1`);
  });

  it("analysis_runs: 一覧", async () => {
    const { listRuns } = await import("@/lib/seo-analysis/runs");
    await listRuns(EVIL);
    expect(query()).toContain(`&user_id=eq.${EVIL_ENC}&order=created_at.desc&limit=`);
  });

  it("geo_brands: 一覧", async () => {
    const { listBrands } = await import("@/lib/geo/store");
    await listBrands(EVIL);
    expect(query()).toBe(`geo_brands?select=*&user_id=eq.${EVIL_ENC}&order=brand_type.asc,created_at.asc`);
  });
});
