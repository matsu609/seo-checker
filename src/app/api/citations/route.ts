/**
 * POST /api/citations — 店名・電話番号・住所で Google を検索し、ウェブ上の掲載・言及（サイテーション）をまとめて返す。
 *
 * 本文: { name, phone?, address?, website? }
 * 応答: CitationReport（src/lib/citations/types.ts）
 *
 * 1 回 = DataForSEO の検索 3 回（電話 / 住所 / 店名。空の項目は飛ばす）。
 * 検索ごとに失敗を分けて持ち、1 つ失敗しても残りの結果は返す。全部失敗したときだけエラー。
 * 同じ入力は 24 時間キャッシュする（掲載状況は日単位でしか動かない）。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guard";
import { globalCache } from "@/lib/cache";
import { buildQueries, buildReport, type CitationInput, type CitationReport, type QueryOutcome } from "@/lib/citations";
import { CitationError, searchGoogle } from "@/lib/citations/dataforseo";
import { ADDRESS_MAX, NAME_MAX, PHONE_MAX, URL_MAX } from "@/lib/listings/profile";
import { takeUsage } from "@/lib/usage/gate";

export const runtime = "nodejs";
export const maxDuration = 90;

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const cache = globalCache<CitationReport>("citations", CACHE_TTL_MS, 100);

const BodySchema = z.object({
  name: z.string().trim().min(1).max(NAME_MAX),
  phone: z.string().trim().max(PHONE_MAX).default(""),
  address: z.string().trim().max(ADDRESS_MAX).default(""),
  website: z.string().trim().max(URL_MAX).default(""),
});

const STATUS_BY_KIND: Record<CitationError["kind"], number> = {
  config: 503,
  auth: 502,
  quota: 502,
  upstream: 502,
  network: 504,
};

export async function POST(request: NextRequest) {
  const denied = await requireAuth({ feature: "citations" });
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "リクエスト形式が不正です" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: "店名を入力してください" }, { status: 422 });

  const input: CitationInput = parsed.data;
  const queries = buildQueries(input);
  const cacheKey = queries.map((q) => q.q).join("\n");
  const cached = cache.get(cacheKey);
  if (cached) return Response.json({ ...cached, cached: true });

  // 月の回数上限（実費の出る呼び出しだけ数える。利用者の決定 2026-09-21）
  const over = await takeUsage("citations", 1, { searches: queries.filter((q) => q.q).length });
  if (over) return over;
  const outcomes: QueryOutcome[] = await Promise.all(
    queries
      .filter((q) => q.q)
      .map(async (q): Promise<QueryOutcome> => {
        try {
          return { id: q.id, hits: await searchGoogle(q.q, { signal: request.signal }), error: null };
        } catch (err) {
          if (err instanceof CitationError) return { id: q.id, hits: [], error: err.message, kind: err.kind } as QueryOutcome & { kind: CitationError["kind"] };
          console.error("[citations] unexpected error", err);
          return { id: q.id, hits: [], error: "検索中にエラーが発生しました" };
        }
      }),
  );

  const failures = outcomes.filter((o) => o.error);
  if (outcomes.length > 0 && failures.length === outcomes.length) {
    const first = failures[0] as QueryOutcome & { kind?: CitationError["kind"] };
    return Response.json({ error: first.error }, { status: first.kind ? STATUS_BY_KIND[first.kind] : 500 });
  }

  const report = buildReport(input, queries, outcomes, new Date().toISOString());
  // 一部失敗した結果は次の実行で取り直したいのでキャッシュしない
  if (failures.length === 0) cache.set(cacheKey, report);
  return Response.json(report);
}
