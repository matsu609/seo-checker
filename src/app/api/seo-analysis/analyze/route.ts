/**
 * POST /api/seo-analysis/analyze { runId } — 保存済みの事実シートを Claude に分析させる。
 * 1 回の収集につき MAX_ANALYSES_PER_RUN 回までやり直せる（回数制限は消費しない）。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guard";
import { currentUserId } from "@/lib/auth/user";
import { dbErrorResponse, DbError } from "@/lib/db/supabase";
import { isAnthropicEnabled, toApiError } from "@/lib/llm/anthropic";
import { generateAnalysis } from "@/lib/seo-analysis/ai/analyze";
import { getRun, MAX_ANALYSES_PER_RUN, saveAnalysis } from "@/lib/seo-analysis/runs";

export const runtime = "nodejs";
export const maxDuration = 300;

const BodySchema = z.object({ runId: z.string().uuid() });

export async function POST(request: NextRequest) {
  const denied = await requireAuth({ feature: "seo-analysis" });
  if (denied) return denied;
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  if (!isAnthropicEnabled()) return Response.json({ error: "ANTHROPIC_API_KEY が未設定です" }, { status: 503 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "リクエスト形式が不正です" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "runId が不正です" }, { status: 400 });

  try {
    const run = await getRun(userId, parsed.data.runId);
    if (!run) return Response.json({ error: "分析が見つかりません" }, { status: 404 });
    if (run.analysisCount >= MAX_ANALYSES_PER_RUN) {
      return Response.json({ error: `この収集結果に対する AI 分析は ${MAX_ANALYSES_PER_RUN} 回までです。新しく収集してください`, code: "limit" }, { status: 429 });
    }
    const record = await generateAnalysis(run.sheet, { signal: request.signal });
    const analysisCount = run.analysisCount + 1;
    await saveAnalysis(userId, run.id, record, analysisCount);
    return Response.json({ analysis: record, analysisCount }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    if (err instanceof DbError) return dbErrorResponse(err);
    const { status, message } = toApiError(err);
    return Response.json({ error: message }, { status });
  }
}
