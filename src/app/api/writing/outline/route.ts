/**
 * POST /api/writing/outline — 一発生成（D1）の構成案づくり。
 *
 * SERPAPI_KEY があれば上位 10 件を取得して本文まで分析し、無ければ
 * 「上位分析なし」で構成案を作る（推定順位をもとに上位を名乗らない）。
 * ANTHROPIC_API_KEY が無ければ 503。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { FetchError } from "@/lib/analyzer/fetch";
import { requireAuth } from "@/lib/auth/guard";
import { globalCache } from "@/lib/cache";
import { isAnthropicEnabled, toApiError } from "@/lib/llm/anthropic";
import { getSerpProvider } from "@/lib/serp";
import { SerpError } from "@/lib/serp/serpapi";
import { generateOutline, OUTLINE_MODEL } from "@/lib/writing/outline";
import { researchTop10, type SerpBrief } from "@/lib/writing/research";
import type { OutlineResult, OutlineSerpEntry } from "@/lib/writing/types";

export const runtime = "nodejs";
// 上位 5 ページの取得 + 構造化出力があるため 60 秒では足りない
export const maxDuration = 300;

/** 同じ条件の作り直しは 10 分間キャッシュ（相手サイトへの負荷対策） */
const cache = globalCache<OutlineResult>("writingOutline", 10 * 60 * 1000, 20);

const BodySchema = z.object({
  keyword: z.string().min(1).max(200),
  memo: z.string().max(1_000).optional(),
  tone: z.enum(["desu", "dearu"]).optional(),
  targetChars: z.number().int().min(500).max(20_000).optional(),
  /** 上位分析を使うか（SERPAPI_KEY があるときだけ有効） */
  useSerp: z.boolean().optional(),
  refresh: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  // ハンドラ内でも検証する（proxy.ts のマッチャ変更でカバーが外れても止める）
  const denied = await requireAuth({ feature: "writing" });
  if (denied) return denied;
  if (!isAnthropicEnabled()) {
    return Response.json(
      { error: "構成案の生成には ANTHROPIC_API_KEY の設定が必要です。サーバーの .env.local に追加してください" },
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

  const tone = parsed.data.tone ?? "desu";
  const memo = parsed.data.memo?.trim() ?? "";
  const targetChars = parsed.data.targetChars;
  const useSerp = parsed.data.useSerp !== false;
  const provider = useSerp ? getSerpProvider() : null;

  const cacheKey = [keyword, tone, memo, targetChars ?? "", provider ? "serp" : "noserp"].join("|");
  if (parsed.data.refresh !== true) {
    const cached = cache.get(cacheKey);
    if (cached) return Response.json({ result: cached, cached: true });
  }

  try {
    const notes: string[] = [];
    let entries: OutlineSerpEntry[] = [];
    let briefs: SerpBrief[] = [];
    let relatedQuestions: string[] = [];

    if (provider) {
      const research = await researchTop10({ keyword, provider, signal: request.signal });
      entries = research.entries;
      briefs = research.briefs;
      relatedQuestions = research.relatedQuestions;
      notes.push(...research.notes);
    } else {
      notes.push(
        useSerp
          ? "SERPAPI_KEY が未設定のため、上位 10 件の分析は行わず、キーワードだけから構成案を作りました。"
          : "上位分析を使わない設定のため、キーワードだけから構成案を作りました。",
      );
    }

    const outline = await generateOutline({
      keyword,
      briefs,
      relatedQuestions,
      ...(memo ? { memo } : {}),
      tone,
      ...(targetChars ? { targetChars } : {}),
      signal: request.signal,
    });

    if (outline.outline.length === 0) {
      return Response.json({ error: "構成案を生成できませんでした。キーワードを変えて再試行してください" }, { status: 502 });
    }

    const result: OutlineResult = {
      id: `${Date.now().toString(36)}-${keyword.slice(0, 20)}`,
      keyword,
      outline,
      serpSource: provider ? "serpapi" : "none",
      top10: entries,
      notes,
      model: OUTLINE_MODEL,
      createdAt: new Date().toISOString(),
    };
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
    console.error("[writing/outline] unexpected error", err);
    return Response.json({ error: "構成案の生成中にエラーが発生しました" }, { status: 500 });
  }
}
