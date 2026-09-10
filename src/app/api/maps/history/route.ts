/**
 * MEO 診断報告書の履歴（Supabase）。
 *
 * GET  … { enabled, items }。?placeId= でその店舗だけ。Supabase 未設定なら enabled: false と空
 * POST … { placeId, aiCommentary? } を受け取り、サーバーで報告書を組み立てて保存する。
 *        画面に出ている報告書と同じキャッシュ（fetch.ts）から作るので内容は一致する
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guard";
import { currentUserId } from "@/lib/auth/user";
import { dbErrorResponse, isSupabaseConfigured } from "@/lib/db/supabase";
import { placesErrorResponse, PlacesError } from "@/lib/maps/client";
import { getPlaceCached } from "@/lib/maps/fetch";
import { AiCommentarySchema, listMeoReports, saveMeoReport, type MeoHistoryItem } from "@/lib/maps/history";
import { buildMeoReport } from "@/lib/maps/report";

export const runtime = "nodejs";
export const maxDuration = 30;

const PLACE_ID = /^[A-Za-z0-9_-]{10,300}$/;

const BodySchema = z.object({
  placeId: z.string().regex(PLACE_ID, "店舗の ID が正しくありません"),
  aiCommentary: AiCommentarySchema.optional(),
});

export interface MapsHistoryListResponse {
  enabled: boolean;
  items: MeoHistoryItem[];
}

export interface MapsHistorySaveResponse {
  item: MeoHistoryItem;
}

export async function GET(request: Request) {
  // ハンドラ内でも検証する（proxy.ts のマッチャ変更でカバーが外れても止める）
  const denied = await requireAuth({ feature: "maps" });
  if (denied) return denied;

  const headers = { "cache-control": "no-store" };
  if (!isSupabaseConfigured()) {
    const body: MapsHistoryListResponse = { enabled: false, items: [] };
    return Response.json(body, { headers });
  }
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "ログインが必要です" }, { status: 401, headers });

  const placeId = new URL(request.url).searchParams.get("placeId");
  if (placeId !== null && !PLACE_ID.test(placeId)) {
    return Response.json({ error: "店舗の ID が正しくありません" }, { status: 400, headers });
  }

  try {
    const items = await listMeoReports(userId, placeId ?? undefined);
    const body: MapsHistoryListResponse = { enabled: true, items };
    return Response.json(body, { headers });
  } catch (err) {
    return dbErrorResponse(err);
  }
}

export async function POST(request: Request) {
  // ハンドラ内でも検証する（proxy.ts のマッチャ変更でカバーが外れても止める）
  const denied = await requireAuth({ feature: "maps" });
  if (denied) return denied;

  if (!isSupabaseConfigured()) {
    return Response.json({ error: "保存機能は設定されていません", code: "not_configured" }, { status: 503 });
  }
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "ログインが必要です" }, { status: 401 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "リクエスト形式が不正です" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "入力が正しくありません" }, { status: 400 });
  }

  try {
    const { detail } = await getPlaceCached(parsed.data.placeId);
    const report = buildMeoReport(detail);
    const item = await saveMeoReport(userId, { ...report, aiCommentary: parsed.data.aiCommentary ?? null });
    const body: MapsHistorySaveResponse = { item };
    return Response.json(body, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (err) {
    if (err instanceof PlacesError) return placesErrorResponse(err);
    return dbErrorResponse(err);
  }
}
