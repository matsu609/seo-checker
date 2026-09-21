/**
 * POST /api/geo/mentions — 業界の地図（LLM Mentions。残タスク #126）。
 *
 * トピックを 1 つ渡すと、その話題の AI 回答でよく引用されているドメインの順位表が返る。
 * **オンデマンドだけ**（Live しか無く費用が行数で増えるため、Cron には入れない。§7.4 の考え方）。
 * クレジットを 5 消費し、残高が足りなければ実行しない。取得に失敗したときは消費しない。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { dbErrorResponse, isSupabaseConfigured } from "@/lib/db/supabase";
import { isDataForSeoConfigured } from "@/lib/geo/dataforseo";
import { MAX_LIMIT } from "@/lib/geo/mentions";
import { MENTION_PLATFORMS } from "@/lib/geo/types";
import { runIndustryMap } from "@/lib/geo/service";
import { requireUser } from "@/lib/auth/guard";

export const runtime = "nodejs";
export const maxDuration = 120;

const BodySchema = z.object({
  keyword: z.string().trim().min(1, "トピックを入力してください").max(200),
  platform: z.enum(MENTION_PLATFORMS).default("google"),
  limit: z.number().int().min(1).max(MAX_LIMIT).optional(),
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

  try {
    const result = await runIndustryMap(userId, parsed.data.keyword, parsed.data.platform, {
      limit: parsed.data.limit,
      signal: request.signal,
    });
    return Response.json(result, { status: result.ok ? 200 : 429, headers: { "cache-control": "no-store" } });
  } catch (err) {
    return dbErrorResponse(err);
  }
}
