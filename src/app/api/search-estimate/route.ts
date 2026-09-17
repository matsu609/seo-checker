/**
 * POST /api/search-estimate — Search Console を連携していなくても、検索の状況を推定して返す。
 *
 * DataForSEO Labs から「そのドメインが順位を持っているキーワード」を取り、
 * 順位別 CTR カーブを掛けて表示回数とクリック数を推定する。
 * 実測ではないので、画面側で必ず「推定」と明示すること。
 *
 * 1 回のリクエストで DataForSEO のクレジットを消費するため、24 時間キャッシュする。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guard";
import { globalCache } from "@/lib/cache";
import { DEFAULT_LIMIT, MAX_LIMIT, SearchEstimateError, fetchRankedKeywords, normalizeTarget, summarize } from "@/lib/search-estimate";
import type { SearchEstimate } from "@/lib/search-estimate";

export const runtime = "nodejs";
export const maxDuration = 120;

/** 順位は日単位でしか動かないので 24 時間で十分。クレジットの節約にもなる */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const cache = globalCache<SearchEstimate>("searchEstimate", CACHE_TTL_MS, 50);

const BodySchema = z.object({
  domain: z.string().min(1).max(253),
  limit: z.number().int().min(1).max(MAX_LIMIT).optional(),
});

const STATUS_BY_KIND: Record<SearchEstimateError["kind"], number> = {
  config: 503,
  auth: 502,
  quota: 502,
  upstream: 502,
  network: 504,
};

export async function POST(request: NextRequest) {
  const denied = await requireAuth({ feature: "search-estimate" });
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "リクエスト形式が不正です" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "ドメインを入力してください" }, { status: 422 });
  }

  const domain = normalizeTarget(parsed.data.domain);
  if (!domain || !domain.includes(".")) {
    return Response.json({ error: "ドメインの形式が正しくありません（例: example.jp）" }, { status: 422 });
  }
  const limit = parsed.data.limit ?? DEFAULT_LIMIT;

  const cacheKey = `${domain}|${limit}`;
  const cached = cache.get(cacheKey);
  if (cached) return Response.json({ ...cached, cached: true });

  try {
    const keywords = await fetchRankedKeywords({ domain, limit, signal: request.signal });
    const result = summarize(domain, keywords, new Date().toISOString());
    cache.set(cacheKey, result);
    return Response.json(result);
  } catch (err) {
    if (err instanceof SearchEstimateError) {
      return Response.json({ error: err.message }, { status: STATUS_BY_KIND[err.kind] });
    }
    console.error("[search-estimate] unexpected error", err);
    return Response.json({ error: "推定の取得中にエラーが発生しました" }, { status: 500 });
  }
}
