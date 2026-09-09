/**
 * POST /api/maps/report
 * 自社の店舗 1 件の詳細を取り、4 カテゴリで採点した診断レポートを返す。
 *
 * 総評はルール生成（AI 不使用）。AI 総評は POST /api/maps/commentary で別途取る。
 * 詳細の取得は fetch.ts のキャッシュ越し（競合比較と共用）。
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guard";
import { placesErrorResponse } from "@/lib/maps/client";
import { getPlaceCached } from "@/lib/maps/fetch";
import { buildMeoReport, type MeoReport } from "@/lib/maps/report";

export const runtime = "nodejs";
export const maxDuration = 30;

const PLACE_ID = /^[A-Za-z0-9_-]{10,300}$/;

const BodySchema = z.object({
  placeId: z.string().regex(PLACE_ID, "店舗の ID が正しくありません"),
  refresh: z.boolean().optional(),
});

export interface MapsReportResponse {
  report: MeoReport;
  cached: boolean;
}

export async function POST(request: Request) {
  // ハンドラ内でも検証する（proxy.ts のマッチャ変更でカバーが外れても止める）
  const denied = await requireAuth({ feature: "maps" });
  if (denied) return denied;

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
    const { detail, cached } = await getPlaceCached(parsed.data.placeId, parsed.data.refresh);
    const body: MapsReportResponse = { report: buildMeoReport(detail), cached };
    return Response.json(body, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return placesErrorResponse(err);
  }
}
