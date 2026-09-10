/**
 * MEO 診断報告書の保存・履歴のテスト。
 *
 * 行の変換（純粋関数）と、PostgREST への問い合わせが必ず user_id で絞られていることを見る。
 * service_role は RLS を素通りするので、user_id の絞り込みが唯一の境界。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "./fixtures/place.json";
import {
  AiCommentarySchema,
  attachAiCommentary,
  deleteMeoReport,
  fromRow,
  getMeoReport,
  HISTORY_LIMIT,
  latestReports,
  listMeoReports,
  saveMeoReport,
  toRow,
  type SavedMeoReport,
} from "../history";
import { parseDetailResponse } from "../parse";
import { buildMeoReport } from "../report";

const NOW = new Date("2026-09-10T03:00:00Z");

function sampleReport(): SavedMeoReport {
  const detail = parseDetailResponse(fixture)!;
  return { ...buildMeoReport(detail, NOW), aiCommentary: ["総評の段落"] };
}

const ROW = {
  id: "0b2f0b8e-0000-4000-8000-000000000000",
  place_id: "ChIJsample",
  place_name: "サンプル",
  generated_at: "2026-09-10T03:00:00.000Z",
  score: 72,
  grade: "B",
  category_scores: { basics: 80, reviews: 60 },
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-key");
  fetchMock = vi.fn(async () => Response.json([ROW]));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function calledUrl(): string {
  return fetchMock.mock.calls[0]![0] as string;
}
function calledInit(): RequestInit {
  return fetchMock.mock.calls[0]![1] as RequestInit;
}

describe("行の変換", () => {
  it("報告書から行を作る（要約列と本文の両方）", () => {
    const report = sampleReport();
    const row = toRow("user_1", report);
    expect(row.user_id).toBe("user_1");
    expect(row.place_id).toBe(report.detail.id);
    expect(row.place_name).toBe("サンプル美容室 渋谷店");
    expect(row.generated_at).toBe(NOW.toISOString());
    expect(row.score).toBe(report.score.score);
    expect(row.grade).toBe(report.score.grade?.grade ?? null);
    expect(Object.keys(row.category_scores).sort()).toEqual(["basics", "photos", "posts", "reviews"]);
    expect(row.report).toBe(report);
  });

  it("行から一覧の 1 件を作る。無いカテゴリは null で埋める", () => {
    const item = fromRow(ROW);
    expect(item).toEqual({
      id: ROW.id,
      placeId: "ChIJsample",
      placeName: "サンプル",
      generatedAt: ROW.generated_at,
      score: 72,
      grade: "B",
      categoryScores: { basics: 80, posts: null, photos: null, reviews: 60 },
    });
  });

  it("AI 総評は段落数と長さを縛る", () => {
    expect(AiCommentarySchema.safeParse(["a", "b"]).success).toBe(true);
    expect(AiCommentarySchema.safeParse(["a", "b", "c", "d", "e", "f"]).success).toBe(false);
    expect(AiCommentarySchema.safeParse(["x".repeat(2001)]).success).toBe(false);
  });
});

describe("問い合わせ", () => {
  it("保存は POST + return=representation。応答の 1 件目を返す", async () => {
    const item = await saveMeoReport("user_1", sampleReport());
    expect(item.id).toBe(ROW.id);
    expect(calledInit().method).toBe("POST");
    expect((calledInit().headers as Record<string, string>).prefer).toBe("return=representation");
    expect(calledUrl()).toContain("/rest/v1/meo_reports?select=id,place_id");
    const body = JSON.parse(calledInit().body as string) as { user_id: string };
    expect(body.user_id).toBe("user_1");
  });

  it("一覧は user_id で絞り、新しい順・上限つき", async () => {
    await listMeoReports("user_1");
    const url = calledUrl();
    expect(url).toContain("user_id=eq.user_1");
    expect(url).toContain("order=generated_at.desc");
    expect(url).toContain(`limit=${HISTORY_LIMIT}`);
    expect(url).not.toContain("place_id=");
  });

  it("店舗を渡すとその店舗だけ。値は URL エンコードする", async () => {
    await listMeoReports("user_1", "ChIJ/x+y");
    expect(calledUrl()).toContain("place_id=eq.ChIJ%2Fx%2By");
  });

  it("1 件取得は user_id と id の両方で絞る。無ければ null", async () => {
    fetchMock.mockResolvedValueOnce(Response.json([{ ...ROW, report: { generatedAt: "x" } }]));
    const entry = await getMeoReport("user_1", ROW.id);
    expect(entry?.item.id).toBe(ROW.id);
    expect(entry?.report).toEqual({ generatedAt: "x" });
    expect(calledUrl()).toContain("user_id=eq.user_1");
    expect(calledUrl()).toContain(`id=eq.${ROW.id}`);

    fetchMock.mockResolvedValueOnce(Response.json([]));
    await expect(getMeoReport("user_2", ROW.id)).resolves.toBeNull();
  });

  it("削除は user_id で絞り、消えた行が無ければ false", async () => {
    await expect(deleteMeoReport("user_1", ROW.id)).resolves.toBe(true);
    expect(calledInit().method).toBe("DELETE");
    expect(calledUrl()).toContain("user_id=eq.user_1");

    fetchMock.mockResolvedValueOnce(Response.json([]));
    await expect(deleteMeoReport("user_2", ROW.id)).resolves.toBe(false);
  });

  it("店舗ごとの最新 1 件だけ拾う（複数店舗を 1 回の問い合わせで）", async () => {
    const older = { ...ROW, id: "0b2f0b8e-0000-4000-8000-000000000001", generated_at: "2026-09-01T00:00:00.000Z", report: { generatedAt: "old" } };
    const newer = { ...ROW, report: { generatedAt: "new" } };
    const other = { ...ROW, id: "0b2f0b8e-0000-4000-8000-000000000002", place_id: "ChIJother", report: { generatedAt: "other" } };
    fetchMock.mockResolvedValueOnce(Response.json([newer, older, other]));
    const map = await latestReports("user_1", ["ChIJsample", "ChIJother", "ChIJnone"]);
    expect(map.size).toBe(2);
    expect(map.get("ChIJsample")?.report).toEqual({ generatedAt: "new" });
    expect(map.get("ChIJother")?.report).toEqual({ generatedAt: "other" });
    expect(calledUrl()).toContain("user_id=eq.user_1");
    expect(calledUrl()).toContain("place_id=in.(");
    expect(calledUrl()).toContain("order=place_id.asc,generated_at.desc");
  });

  it("店舗が無ければ問い合わせない", async () => {
    await expect(latestReports("user_1", [])).resolves.toEqual(new Map());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("AI 総評は本文に書き足す（他人の行なら false）", async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json([{ ...ROW, report: { generatedAt: "x", aiCommentary: null } }]))
      .mockResolvedValueOnce(Response.json([{ id: ROW.id }]));
    await expect(attachAiCommentary("user_1", ROW.id, ["段落"])).resolves.toBe(true);
    const [, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({ report: { generatedAt: "x", aiCommentary: ["段落"] } });
    expect(fetchMock.mock.calls[1]![0] as string).toContain("user_id=eq.user_1");

    fetchMock.mockResolvedValueOnce(Response.json([]));
    await expect(attachAiCommentary("user_2", ROW.id, ["段落"])).resolves.toBe(false);
  });

  it("応答の形が違えばエラーにする（黙って空にしない）", async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ oops: true }));
    await expect(listMeoReports("user_1")).rejects.toThrow("履歴");
  });
});
