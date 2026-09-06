import { NextRequest } from "next/server";
import { FetchError, type SiteAnalysisResult } from "@/lib/analyzer";
import { analyzeSite, DEFAULT_MAX_PAGES, MAX_PAGES_LIMIT } from "@/lib/analyzer/site";
import { globalCache } from "@/lib/cache";

// 複数ページを順に取得するため、1 ページ診断より長くかかる
export const maxDuration = 300;

const cache = globalCache<SiteAnalysisResult>("site", 10 * 60 * 1000);

export async function POST(request: NextRequest) {
  let body: { url?: unknown; maxPages?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "リクエスト形式が不正です" }, { status: 400 });
  }
  const { url, maxPages } = body;
  if (typeof url !== "string" || !url.trim()) {
    return Response.json({ error: "URLを入力してください" }, { status: 400 });
  }

  const pages =
    typeof maxPages === "number" && Number.isFinite(maxPages)
      ? Math.min(Math.max(Math.trunc(maxPages), 1), MAX_PAGES_LIMIT)
      : DEFAULT_MAX_PAGES;

  const key = `${url.trim().toLowerCase()}|${pages}`;
  const cached = cache.get(key);
  if (cached) {
    return Response.json({ result: cached, cached: true });
  }

  try {
    const result = await analyzeSite(url, { maxPages: pages });
    cache.set(key, result);
    return Response.json({ result, cached: false });
  } catch (err) {
    if (err instanceof FetchError) {
      const status = err.code === "invalid_url" || err.code === "blocked_host" ? 400 : 502;
      return Response.json({ error: err.message, code: err.code }, { status });
    }
    console.error("[site] unexpected error", err);
    return Response.json({ error: "診断中に予期しないエラーが発生しました" }, { status: 500 });
  }
}
