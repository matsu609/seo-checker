/**
 * POST /api/page-diagnosis — キーワード × ページの診断（A4）。
 *
 * SERPAPI_KEY があれば Top10 を実測、無ければ ANTHROPIC_API_KEY で推定する。
 * どちらも無ければ 503（何を設定すればよいかを日本語で返す）。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { FetchError } from "@/lib/analyzer/fetch";
import { globalCache } from "@/lib/cache";
import { isAnthropicEnabled, toApiError } from "@/lib/llm/anthropic";
import { runDiagnosis } from "@/lib/page-diagnosis/run";
import { diagnosisId } from "@/lib/page-diagnosis/store";
import type { DiagnosisResult } from "@/lib/page-diagnosis/types";
import { getSerpProvider } from "@/lib/serp";
import { SerpError } from "@/lib/serp/serpapi";

export const runtime = "nodejs";
// Top10 の取得（10 ページ）と LLM 分析があるため 60 秒では足りない
export const maxDuration = 300;

/** 同じキーワード・URL の再診断は 10 分間キャッシュ（相手サイトへの負荷対策） */
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = globalCache<DiagnosisResult>("pageDiagnosis", CACHE_TTL_MS, 20);

const BodySchema = z.object({
  keyword: z.string().min(1).max(200),
  url: z.string().max(2_000).optional(),
  device: z.enum(["desktop", "mobile"]).optional(),
  location: z.string().max(120).optional(),
  projectDomain: z.string().max(255).optional(),
  refresh: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  const provider = getSerpProvider();
  const anthropicEnabled = isAnthropicEnabled();
  if (!provider && !anthropicEnabled) {
    return Response.json(
      {
        error:
          "ページ診断には SERPAPI_KEY または ANTHROPIC_API_KEY のいずれかが必要です。サーバーの .env.local に追加してください",
      },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "リクエスト形式が不正です" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "対策キーワードを入力してください（200 文字以内）" }, { status: 422 });
  }
  const keyword = parsed.data.keyword.replace(/\s+/g, " ").trim();
  if (!keyword) {
    return Response.json({ error: "対策キーワードを入力してください" }, { status: 422 });
  }
  const url = parsed.data.url?.trim();
  const device = parsed.data.device ?? "desktop";
  const location = parsed.data.location?.trim();
  const projectDomain = parsed.data.projectDomain?.trim();

  const cacheKey = [diagnosisId(keyword, url ?? null), device, location ?? "", projectDomain ?? ""].join("|");
  if (parsed.data.refresh !== true) {
    const cached = cache.get(cacheKey);
    if (cached) return Response.json({ result: cached, cached: true });
  }

  try {
    const result = await runDiagnosis({
      keyword,
      ...(url ? { url } : {}),
      device,
      ...(location ? { location } : {}),
      ...(projectDomain ? { projectDomain } : {}),
      provider,
      anthropicEnabled,
      signal: request.signal,
    });
    cache.set(cacheKey, result);
    return Response.json({ result, cached: false });
  } catch (err) {
    if (err instanceof SerpError) {
      const status = err.code === "auth" ? 503 : err.code === "rate_limit" ? 429 : 502;
      return Response.json({ error: err.message }, { status });
    }
    if (err instanceof FetchError) {
      const status = err.code === "invalid_url" || err.code === "blocked_host" ? 400 : 502;
      return Response.json({ error: err.message }, { status });
    }
    const info = toApiError(err);
    if (info.status !== 500) {
      return Response.json({ error: info.message }, { status: info.status });
    }
    console.error("[page-diagnosis] unexpected error", err);
    return Response.json({ error: "ページ診断中にエラーが発生しました" }, { status: 500 });
  }
}
