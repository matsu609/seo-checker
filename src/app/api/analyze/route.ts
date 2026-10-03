import { NextRequest } from "next/server";
import { analyze, FetchError, type AnalysisResult } from "@/lib/analyzer";
import { fetchErrorResponse, publicUrlError, urlCacheKey } from "@/lib/analyzer/fetch-response";
import { globalCache } from "@/lib/cache";
import { requireFreeAccess } from "@/lib/free/access";
import { checkFreeRun, recordFreeRun } from "@/lib/free/monthly";
import { clientKeyOf } from "@/lib/free/ratelimit";

export const runtime = "nodejs";
// robots.txt / llms.txt / 本文の取得を含めると 10 秒を超えることがある
export const maxDuration = 60;

const cache = globalCache<AnalysisResult>("analyze", 10 * 60 * 1000);

export async function POST(request: NextRequest) {
  // 無料診断は固定リンク（/free）の Cookie が要る（利用者の決定 2026-10-02）
  const denied = await requireFreeAccess();
  if (denied) return denied;
  let url: unknown;
  try {
    ({ url } = await request.json());
  } catch {
    return Response.json({ error: "リクエスト形式が不正です" }, { status: 400 });
  }
  if (typeof url !== "string" || !url.trim()) {
    return Response.json({ error: "URLを入力してください" }, { status: 400 });
  }

  // 形式の誤った URL・内部ネットワークは回数を減らさずに 400（2026-09-23: 以前は消費してから検査していた）
  const invalid = await publicUrlError(url);
  if (invalid) return invalid;

  // スキームとホストだけを小文字にする（/About と /about を同じ結果にしない。2026-09-23）
  const key = urlCacheKey(url);
  const cached = cache.get(key);
  if (cached) {
    return Response.json({ result: cached, cached: true });
  }

  // キャッシュに無い = 本当に診断するときだけ、月の上限（全体）を見て、呼べたら 1 回数える
  const over = await checkFreeRun();
  if (over) return over;
  try {
    const result = await analyze(url);
    cache.set(key, result);
    void recordFreeRun("free-page", url, clientKeyOf(request));
    return Response.json({ result, cached: false });
  } catch (err) {
    if (err instanceof FetchError) return fetchErrorResponse(err);
    console.error("[analyze] unexpected error", err);
    return Response.json({ error: "診断中に予期しないエラーが発生しました" }, { status: 500 });
  }
}
