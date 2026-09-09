/**
 * POST /api/improvement
 * URL を 1 つ受け取り、機械的な診断と AI の改修案を返す。
 *
 * 対象は 1 ページ。サイト全体を一括で回すと実費と実行時間が読めないため、
 * 意図的に絞っている（README の「HP 改修提案」を参照）。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { FetchError } from "@/lib/analyzer/fetch";
import { requireAuth } from "@/lib/auth/guard";
import { globalCache } from "@/lib/cache";
import { generateImprovement, type ImprovementResult } from "@/lib/improvement/generate";
import { isAnthropicEnabled, toApiError } from "@/lib/llm/anthropic";

export const runtime = "nodejs";
// ページ取得 + robots + AI 生成。AI が長いので広めに取る
export const maxDuration = 300;

const CACHE_TTL_MS = 30 * 60 * 1000;
/** 1 件が数十 KB。同じ URL を続けて押されたときに実費を二重に払わないためのもの */
const cache = globalCache<ImprovementResult>("improvement", CACHE_TTL_MS, 50);

const BodySchema = z.object({
  url: z.string().min(1, "URL を入力してください").max(2000),
  keyword: z.string().max(200).optional(),
  refresh: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  // ハンドラ内でも検証する（proxy.ts のマッチャ変更でカバーが外れても止める）
  const denied = await requireAuth({ feature: "improvement" });
  if (denied) return denied;

  if (!isAnthropicEnabled()) {
    return Response.json(
      { error: "改修提案の生成には ANTHROPIC_API_KEY の設定が必要です。サーバーの .env.local に追加してください" },
      { status: 503 },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "リクエスト形式が不正です" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "入力が正しくありません" },
      { status: 400 },
    );
  }
  const { url, keyword, refresh } = parsed.data;

  const key = `${url}|${keyword ?? ""}`;
  if (!refresh) {
    const hit = cache.get(key);
    if (hit) return Response.json({ result: hit, cached: true });
  }

  try {
    const result = await generateImprovement({ url, keyword, signal: request.signal });
    cache.set(key, result);
    return Response.json({ result, cached: false });
  } catch (err) {
    if (err instanceof FetchError) {
      return Response.json({ error: err.message }, { status: err.code === "blocked_host" ? 400 : 502 });
    }
    const api = toApiError(err);
    return Response.json({ error: api.message }, { status: api.status });
  }
}
