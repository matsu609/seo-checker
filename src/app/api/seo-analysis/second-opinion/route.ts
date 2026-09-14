/**
 * POST /api/seo-analysis/second-opinion { runId } — ChatGPT のセカンドオピニオン。
 * Claude の分析が保存されていることが前提。OPENAI_API_KEY が無ければ 503。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guard";
import { currentUserId } from "@/lib/auth/user";
import { dbErrorResponse, DbError } from "@/lib/db/supabase";
import { generateSecondOpinion, isSecondOpinionEnabled } from "@/lib/seo-analysis/ai/second-opinion";
import { getRun, saveSecondOpinion } from "@/lib/seo-analysis/runs";

export const runtime = "nodejs";
export const maxDuration = 180;

const BodySchema = z.object({ runId: z.string().uuid() });

export async function POST(request: NextRequest) {
  const denied = await requireAuth({ feature: "seo-analysis" });
  if (denied) return denied;
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  if (!isSecondOpinionEnabled()) {
    return Response.json({ error: "セカンドオピニオンには OPENAI_API_KEY の設定が必要です", code: "disabled" }, { status: 503 });
  }

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
    if (!run.analysis) return Response.json({ error: "先に AI 分析を実行してください" }, { status: 409 });
    const record = await generateSecondOpinion(run.sheet, run.analysis.analysis, { signal: request.signal });
    if (!record) return Response.json({ error: "セカンドオピニオンは無効です", code: "disabled" }, { status: 503 });
    await saveSecondOpinion(userId, run.id, record);
    return Response.json({ secondOpinion: record }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    if (err instanceof DbError) return dbErrorResponse(err);
    console.error("[seo-analysis] second opinion failed", err);
    return Response.json({ error: err instanceof Error ? err.message : "セカンドオピニオンの生成に失敗しました" }, { status: 502 });
  }
}
