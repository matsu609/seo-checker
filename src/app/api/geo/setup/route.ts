/**
 * GET/PUT /api/geo/setup — AI 検索モニタリングの設定（プロンプトの登録）。
 *
 * 自社ブランド・競合・検索キーワードは 2026-09-19 から設定（/settings）に集約し、
 * ここでは受け付けない（GET のたびに設定から geo テーブルへ同期する: src/lib/geo/sync.ts）。
 * この画面で登録するのはプロンプトだけ。
 *
 * 行は必ずログイン中の user_id で絞る。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { dbErrorResponse, isSupabaseConfigured } from "@/lib/db/supabase";
import { normalizedHash } from "@/lib/geo/normalize";
import { precisionWarning } from "@/lib/geo/schedule";
import { deletePrompt, ensureAccount, listPrompts, savePrompt } from "@/lib/geo/store";
import { syncGeoFromSettings } from "@/lib/geo/sync";
import { GEO_LLM_MODELS } from "@/lib/geo/types";
import { loadSharedSettings } from "@/lib/settings/server";
import { requireUser } from "@/lib/auth/guard";

export const runtime = "nodejs";

const PromptSchema = z.object({
  kind: z.literal("prompt"),
  id: z.string().optional(),
  text: z.string().trim().min(1).max(500),
  isBranded: z.boolean().default(false),
  precisionMode: z.boolean().default(false),
  // プロンプトを投げるのは LLM だけ（AI Overviews と AI モードはキーワード側で測る）
  models: z.array(z.enum(GEO_LLM_MODELS)).min(1).max(GEO_LLM_MODELS.length),
  tags: z.array(z.string().trim().max(40)).max(10).default([]),
});

const DeleteSchema = z.object({ kind: z.literal("delete"), target: z.literal("prompt"), id: z.string() });

const BodySchema = z.discriminatedUnion("kind", [PromptSchema, DeleteSchema]);

export async function GET() {
  const userId = await requireUser({ feature: "geo" });
  if (userId instanceof Response) return userId;
  if (!isSupabaseConfigured()) return Response.json({ error: "Supabase が未設定です", code: "not_configured" }, { status: 503 });

  try {
    const settings = await loadSharedSettings(userId);
    const [account, prompts, synced] = await Promise.all([ensureAccount(userId), listPrompts(userId), syncGeoFromSettings(userId, settings)]);
    return Response.json(
      {
        account,
        brands: synced.brands,
        prompts,
        keywords: synced.keywords,
        // 画面が「設定で直してください」の導線を出すための状態
        settings: { siteRegistered: settings.project !== null, keywordCount: settings.keywords.length },
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (err) {
    return dbErrorResponse(err);
  }
}

export async function PUT(request: NextRequest) {
  const userId = await requireUser({ feature: "geo" });
  if (userId instanceof Response) return userId;
  if (!isSupabaseConfigured()) return Response.json({ error: "Supabase が未設定です", code: "not_configured" }, { status: 503 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "リクエスト形式が不正です" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "入力が正しくありません" }, { status: 400 });

  try {
    const body = parsed.data;
    if (body.kind === "prompt") {
      // 指名プロンプトを高精度枠にしようとしたら警告（§2.2）。保存自体は止めない
      const warning = body.precisionMode ? precisionWarning(body.isBranded) : null;
      await savePrompt(
        userId,
        {
          text: body.text,
          normalizedHash: await normalizedHash(body.text),
          isBranded: body.isBranded,
          precisionMode: body.precisionMode,
          models: body.models,
          tags: body.tags,
        },
        body.id,
      );
      return Response.json({ ok: true, warning });
    }
    await deletePrompt(userId, body.id);
    return Response.json({ ok: true });
  } catch (err) {
    return dbErrorResponse(err);
  }
}
