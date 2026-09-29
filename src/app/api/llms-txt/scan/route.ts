import { NextRequest } from "next/server";
import { FetchError } from "@/lib/analyzer/fetch";
import { fetchErrorResponse, publicUrlError, urlCacheKey } from "@/lib/analyzer/fetch-response";
import { requireAuth } from "@/lib/auth/guard";
import { globalCache } from "@/lib/cache";
import { resolveMaxPages } from "@/lib/crawl/crawler";
import { acquireCrawlSlot, crawlClientKey } from "@/lib/crawl/gate";
import { DEFAULT_SCAN_LIMIT, scanSite } from "@/lib/llms-txt/scan";
import type { ScanResult } from "@/lib/llms-txt/types";

export const runtime = "nodejs";
// 最大 300 ページまでクロールできるため、他のクロール系と同じ余裕を取る
export const maxDuration = 300;

const cache = globalCache<ScanResult>("llms-txt-scan", 10 * 60 * 1000, 20);

/**
 * POST { url, includePaths?, excludePaths?, limit? }
 *
 * llms.txt に載せる候補ページを集める。外部連携は不要。
 * 入力の不備は 400、取得できないサイトは 502 で返す。
 *
 * 同時実行の上限は crawl/gate.ts の "llms-scan" の枠（/api/site・/api/site-audit と同じ考え方）。
 * 1 回の POST が対象サイトへ最大でサイトマップ + maxPages（既定 300）回のリクエストを出すため。
 */
export async function POST(request: NextRequest) {
  // ハンドラ内でも検証する（proxy.ts のマッチャ変更でカバーが外れても止める）
  const denied = await requireAuth({ feature: "llms-txt" });
  if (denied) return denied;
  let body: { url?: unknown; includePaths?: unknown; excludePaths?: unknown; limit?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "リクエスト形式が不正です" }, { status: 400 });
  }

  const { url, includePaths, excludePaths, limit } = body;
  if (typeof url !== "string" || !url.trim()) {
    return Response.json({ error: "サイトの URL を入力してください" }, { status: 400 });
  }
  if (includePaths !== undefined && typeof includePaths !== "string") {
    return Response.json({ error: "対象パスは文字列で指定してください" }, { status: 422 });
  }
  if (excludePaths !== undefined && typeof excludePaths !== "string") {
    return Response.json({ error: "除外パスは文字列で指定してください" }, { status: 422 });
  }
  if (limit !== undefined && (typeof limit !== "number" || !Number.isFinite(limit) || limit < 1)) {
    return Response.json({ error: "上限ページ数は 1 以上の数値で指定してください" }, { status: 422 });
  }
  // 黙って丸めず、上限を超える指定は断る。上限は運用側の上限（SITE_MAX_PAGES。既定 300）。
  // 2026-09-23: 以前は HARD_MAX_PAGES（1000）と比べていたため、301〜1000 は断られずに
  // 黙って 300 へ丸められていた（このコメントの約束と逆）
  const cap = resolveMaxPages();
  if (typeof limit === "number" && limit > cap) {
    return Response.json({ error: `上限ページ数は ${cap} 以下で指定してください` }, { status: 422 });
  }

  const invalid = await publicUrlError(url);
  if (invalid) return invalid;

  const key = [urlCacheKey(url), includePaths ?? "", excludePaths ?? "", limit ?? DEFAULT_SCAN_LIMIT].join("|");
  const cached = cache.get(key);
  if (cached) return Response.json({ scan: cached, cached: true });

  const release = acquireCrawlSlot("llms-scan", crawlClientKey(request.headers));
  if (!release) {
    return Response.json(
      { error: "ページの収集が混み合っています。しばらく待ってからお試しください", code: "busy" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  try {
    const scan = await scanSite(url, {
      includePaths: typeof includePaths === "string" ? includePaths : undefined,
      excludePaths: typeof excludePaths === "string" ? excludePaths : undefined,
      limit: typeof limit === "number" ? limit : DEFAULT_SCAN_LIMIT,
      signal: request.signal,
    });
    cache.set(key, scan);
    return Response.json({ scan, cached: false });
  } catch (err) {
    if (err instanceof FetchError) return fetchErrorResponse(err);
    console.error("[llms-txt/scan] unexpected error", err);
    return Response.json({ error: "ページの収集中にエラーが発生しました" }, { status: 500 });
  } finally {
    release();
  }
}
