import { NextRequest } from "next/server";
import { analyze, FetchError, type AnalysisResult } from "@/lib/analyzer";
import { globalCache } from "@/lib/cache";

export const runtime = "nodejs";
// robots.txt / llms.txt / 本文の取得を含めると 10 秒を超えることがある
export const maxDuration = 60;

const cache = globalCache<AnalysisResult>("analyze", 10 * 60 * 1000);

export async function POST(request: NextRequest) {
  let url: unknown;
  try {
    ({ url } = await request.json());
  } catch {
    return Response.json({ error: "リクエスト形式が不正です" }, { status: 400 });
  }
  if (typeof url !== "string" || !url.trim()) {
    return Response.json({ error: "URLを入力してください" }, { status: 400 });
  }

  const key = url.trim().toLowerCase();
  const cached = cache.get(key);
  if (cached) {
    return Response.json({ result: cached, cached: true });
  }

  try {
    const result = await analyze(url);
    cache.set(key, result);
    return Response.json({ result, cached: false });
  } catch (err) {
    if (err instanceof FetchError) {
      const status = err.code === "invalid_url" || err.code === "blocked_host" ? 400 : 502;
      return Response.json({ error: err.message, code: err.code }, { status });
    }
    console.error("[analyze] unexpected error", err);
    return Response.json({ error: "診断中に予期しないエラーが発生しました" }, { status: 500 });
  }
}
