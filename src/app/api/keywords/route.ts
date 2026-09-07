/**
 * POST /api/keywords — 種キーワードからサジェスト・関連 KW を展開し、検索意図を付ける（C1）。
 *
 * 外部連携は 1 つも必須ではない（Google サジェストは公開エンドポイント）。
 * SERPAPI_KEY があれば関連 KW / PAA を足し、ANTHROPIC_API_KEY があれば
 * ルールで決まらなかった意図を AI で分類する。無い場合はその旨を notes で返す。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { globalCache } from "@/lib/cache";
import { llmIntentClassifier } from "@/lib/keywords/intent";
import { researchKeywords } from "@/lib/keywords/research";
import type { KeywordsResponse } from "@/lib/keywords/types";
import { FetchError } from "@/lib/analyzer/fetch";
import { isAnthropicEnabled } from "@/lib/llm/anthropic";
import { getSerpProvider } from "@/lib/serp";

export const runtime = "nodejs";
export const maxDuration = 120;

/** サジェストは変動が遅いので 1 時間キャッシュする（実装ガイド §8.1） */
const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = globalCache<KeywordsResponse>("keywordsResearch", CACHE_TTL_MS, 30);

const BodySchema = z.object({
  seed: z.string().min(1).max(100),
  groups: z.array(z.enum(["kana", "alpha", "digit"])).max(3).optional(),
  /** 関連 KW を取りに行くか（SERP のクレジットを消費するので明示） */
  useRelated: z.boolean().optional(),
  /** 検索意図の AI 分類を使うか */
  useLlmIntent: z.boolean().optional(),
  /** サイト誘導と判定するためのブランド語 */
  brandTerms: z.array(z.string().max(80)).max(20).optional(),
});

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "リクエスト形式が不正です" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "種キーワードを入力してください（100 文字以内）" }, { status: 422 });
  }
  const seed = parsed.data.seed.replace(/\s+/g, " ").trim();
  if (!seed) {
    return Response.json({ error: "種キーワードを入力してください" }, { status: 422 });
  }

  const groups = parsed.data.groups ?? ["kana", "alpha"];
  const useRelated = parsed.data.useRelated !== false;
  const useLlmIntent = parsed.data.useLlmIntent !== false;
  const brandTerms = (parsed.data.brandTerms ?? []).map((t) => t.trim()).filter(Boolean);

  const provider = useRelated ? getSerpProvider() : null;
  const classifier = useLlmIntent && isAnthropicEnabled() ? llmIntentClassifier : null;

  const cacheKey = [
    seed,
    groups.slice().sort().join("+"),
    provider ? "serp" : "-",
    classifier ? "llm" : "-",
    brandTerms.join(","),
  ].join("|");
  const cached = cache.get(cacheKey);
  if (cached) {
    return Response.json({ ...cached, cached: true });
  }

  try {
    const result = await researchKeywords({
      seed,
      groups,
      provider,
      classifier,
      brandTerms,
      signal: request.signal,
    });
    cache.set(cacheKey, result);
    return Response.json(result);
  } catch (err) {
    if (err instanceof FetchError) {
      // サジェストのホスト検査・URL 生成で落ちたとき
      return Response.json({ error: `サジェストを取得できませんでした（${err.message}）` }, { status: 502 });
    }
    console.error("[keywords] unexpected error", err);
    return Response.json({ error: "キーワード調査中にエラーが発生しました" }, { status: 500 });
  }
}
