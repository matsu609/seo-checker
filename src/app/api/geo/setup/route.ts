/**
 * GET/PUT /api/geo/setup — オンボーディング（仕様書 §10「自社ドメイン、競合、
 * エイリアス登録を必須ステップに」）とプロンプト・キーワードの登録。
 *
 * 行は必ずログイン中の user_id で絞る。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guard";
import { currentUserId } from "@/lib/auth/user";
import { dbErrorResponse, isSupabaseConfigured } from "@/lib/db/supabase";
import { normalizedHash } from "@/lib/geo/normalize";
import { precisionWarning } from "@/lib/geo/schedule";
import {
  deleteBrand,
  deleteKeyword,
  deletePrompt,
  ensureAccount,
  listBrands,
  listKeywords,
  listPrompts,
  saveBrand,
  saveKeyword,
  savePrompt,
} from "@/lib/geo/store";
import { GEO_MODELS } from "@/lib/geo/types";

export const runtime = "nodejs";

const BrandSchema = z.object({
  kind: z.literal("brand"),
  id: z.string().optional(),
  type: z.enum(["own", "competitor"]),
  displayName: z.string().trim().min(1).max(100),
  aliases: z.array(z.string().trim().max(100)).max(20).default([]),
  domains: z.array(z.string().trim().max(253)).max(20).default([]),
});

const PromptSchema = z.object({
  kind: z.literal("prompt"),
  id: z.string().optional(),
  text: z.string().trim().min(1).max(500),
  isBranded: z.boolean().default(false),
  precisionMode: z.boolean().default(false),
  models: z.array(z.enum(GEO_MODELS)).min(1).max(3),
  tags: z.array(z.string().trim().max(40)).max(10).default([]),
});

const KeywordSchema = z.object({
  kind: z.literal("keyword"),
  text: z.string().trim().min(1).max(200),
  trackRank: z.boolean().default(true),
  trackAio: z.boolean().default(true),
});

const DeleteSchema = z.object({ kind: z.literal("delete"), target: z.enum(["brand", "prompt", "keyword"]), id: z.string() });

const BodySchema = z.discriminatedUnion("kind", [BrandSchema, PromptSchema, KeywordSchema, DeleteSchema]);

export async function GET() {
  const denied = await requireAuth({ feature: "geo" });
  if (denied) return denied;
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "ログインが必要です" }, { status: 401 });
  if (!isSupabaseConfigured()) return Response.json({ error: "Supabase が未設定です", code: "not_configured" }, { status: 503 });

  try {
    const [account, brands, prompts, keywords] = await Promise.all([
      ensureAccount(userId),
      listBrands(userId),
      listPrompts(userId),
      listKeywords(userId),
    ]);
    return Response.json({ account, brands, prompts, keywords }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return dbErrorResponse(err);
  }
}

export async function PUT(request: NextRequest) {
  const denied = await requireAuth({ feature: "geo" });
  if (denied) return denied;
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "ログインが必要です" }, { status: 401 });
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
    if (body.kind === "brand") {
      const brand = await saveBrand(userId, { type: body.type, displayName: body.displayName, aliases: body.aliases, domains: body.domains }, body.id);
      return Response.json({ ok: true, brand });
    }
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
    if (body.kind === "keyword") {
      await saveKeyword(userId, {
        text: body.text,
        normalizedHash: await normalizedHash(body.text),
        trackRank: body.trackRank,
        trackAio: body.trackAio,
      });
      return Response.json({ ok: true });
    }
    if (body.target === "brand") await deleteBrand(userId, body.id);
    else if (body.target === "prompt") await deletePrompt(userId, body.id);
    else await deleteKeyword(userId, body.id);
    return Response.json({ ok: true });
  } catch (err) {
    return dbErrorResponse(err);
  }
}
