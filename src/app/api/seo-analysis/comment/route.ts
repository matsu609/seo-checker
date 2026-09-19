/**
 * POST /api/seo-analysis/comment { title, facts } — 画面ごとの短い講評。
 *
 * サイト診断など各ツールの結果から作った事実（Fact[]）を渡すと、その数字だけを
 * 根拠にした要約・ポイント・次にやることを返す（利用者の指示: 個々の分析結果ごとに
 * AI の分析を見られるように）。回数制限の対象外だが、facts の長さはここで縛る。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guard";
import { globalCache } from "@/lib/cache";
import { isAnthropicEnabled, toApiError } from "@/lib/llm/anthropic";
import { generateComment } from "@/lib/seo-analysis/ai/analyze";
import type { Comment } from "@/lib/seo-analysis/ai/schema";

export const runtime = "nodejs";
export const maxDuration = 120;

const FactSchema = z.object({
  id: z.string().max(12),
  area: z.enum(["input", "crawl", "structure", "trust", "speed", "search", "google"]),
  label: z.string().max(200),
  value: z.string().max(600),
  note: z.string().max(1000).optional(),
  url: z.string().max(500).optional(),
});

const BodySchema = z.object({
  title: z.string().max(80),
  facts: z.array(FactSchema).min(1).max(400),
});

const cache = globalCache<{ comment: Comment; model: string }>("seo-analysis-comment", 30 * 60 * 1000, 50);

export async function POST(request: NextRequest) {
  const denied = await requireAuth({ feature: "seo-analysis" });
  if (denied) return denied;
  if (!isAnthropicEnabled()) return Response.json({ error: "この講評には ANTHROPIC_API_KEY の設定が必要です" }, { status: 503 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "リクエスト形式が不正です" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "事実の形式が正しくないか、件数が多すぎます" }, { status: 422 });

  const key = JSON.stringify(parsed.data);
  const hit = cache.get(key);
  if (hit) return Response.json({ ...hit, cached: true });
  try {
    const out = await generateComment(parsed.data.title, parsed.data.facts, { signal: request.signal });
    cache.set(key, out);
    return Response.json({ ...out, cached: false }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    const { status, message } = toApiError(err);
    return Response.json({ error: message }, { status });
  }
}
