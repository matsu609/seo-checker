/**
 * POST /api/geo/run — 「今すぐ実行」（Live モード。仕様書 §1.2 / §6.2）。
 *
 * **Live を呼ぶのはこの経路だけ**（§7.4: 定期実行から Live に落ちる道は作らない）。
 * クレジットを 2 消費し、残高が足りなければ実行しない（ソフトキャップ）。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { dbErrorResponse, isSupabaseConfigured } from "@/lib/db/supabase";
import { isDataForSeoConfigured } from "@/lib/geo/dataforseo";
import { runLive } from "@/lib/geo/service";
import { GEO_LLM_MODELS, GEO_MODEL_LABELS, GEO_MODELS, isLlmModel } from "@/lib/geo/types";
import { requireUser } from "@/lib/auth/guard";

export const runtime = "nodejs";
export const maxDuration = 120;

const BodySchema = z.object({
  text: z.string().trim().min(1, "プロンプトを入力してください").max(500),
  model: z.enum(GEO_MODELS).default("chatgpt"),
});

export async function POST(request: NextRequest) {
  const userId = await requireUser({ feature: "geo" });
  if (userId instanceof Response) return userId;
  if (!isSupabaseConfigured()) return Response.json({ error: "Supabase が未設定です", code: "not_configured" }, { status: 503 });
  if (!isDataForSeoConfigured()) {
    return Response.json({ error: "DataForSEO が未設定です（DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD）", code: "not_configured" }, { status: 503 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "リクエスト形式が不正です" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "入力が正しくありません" }, { status: 400 });
  if (!isLlmModel(parsed.data.model)) {
    return Response.json(
      {
        error: `${GEO_MODEL_LABELS[parsed.data.model]}は検索キーワード側で計測します（今すぐ実行の対象は ${GEO_LLM_MODELS.map((m) => GEO_MODEL_LABELS[m]).join(" / ")} です）`,
      },
      { status: 400 },
    );
  }

  try {
    const result = await runLive(userId, parsed.data.text, parsed.data.model, { signal: request.signal });
    return Response.json(result, { status: result.ok ? 200 : 429, headers: { "cache-control": "no-store" } });
  } catch (err) {
    return dbErrorResponse(err);
  }
}
