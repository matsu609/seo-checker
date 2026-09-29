import { NextRequest } from "next/server";
import { analyze, FetchError, type AnalysisResult } from "@/lib/analyzer";
import { fetchErrorResponse, publicUrlError, urlCacheKey } from "@/lib/analyzer/fetch-response";
import { globalCache } from "@/lib/cache";
import { consumeFreeRun, requireFreeUser } from "@/lib/free/quota";

export const runtime = "nodejs";
// robots.txt / llms.txt / 本文の取得を含めると 10 秒を超えることがある
export const maxDuration = 60;

const cache = globalCache<AnalysisResult>("analyze", 10 * 60 * 1000);

export async function POST(request: NextRequest) {
  // 無料診断は登録（ログイン）したメールアドレスごとに回数制限（利用者の決定 2026-09-18）
  const denied = await requireFreeUser();
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

  // キャッシュに無い = 本当に診断するときだけ 1 回ぶん消費する
  const exhausted = await consumeFreeRun();
  if (exhausted) return exhausted;
  try {
    const result = await analyze(url);
    cache.set(key, result);
    return Response.json({ result, cached: false });
  } catch (err) {
    if (err instanceof FetchError) return fetchErrorResponse(err);
    console.error("[analyze] unexpected error", err);
    return Response.json({ error: "診断中に予期しないエラーが発生しました" }, { status: 500 });
  }
}
