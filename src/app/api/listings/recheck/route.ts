/**
 * POST /api/listings/recheck { placeId } … 掲載の確認をいますぐ行う（掲載済みで URL がある媒体すべて）。
 * 毎月 2 日の自動確認と同じ中身。知らせは出さない（画面に結果が出るため）。
 */
import { z } from "zod";
import { dbErrorResponse } from "@/lib/db/supabase";
import { badRequest, NO_STORE, PLACE_ID, readJson, requireListingsUser } from "@/lib/listings/api";
import { recheckListing } from "@/lib/listings/job";
import type { RecheckLine } from "@/lib/listings/recheck";
import { getListing, type ListingRecord } from "@/lib/listings/store";

export const runtime = "nodejs";
export const maxDuration = 120;

const BodySchema = z.object({ placeId: z.string().regex(PLACE_ID, "店舗の ID が正しくありません") });

export interface ListingsRecheckResponse {
  record: ListingRecord;
  lines: RecheckLine[];
}

export async function POST(request: Request) {
  const userId = await requireListingsUser();
  if (userId instanceof Response) return userId;
  const raw = await readJson(request);
  if (raw instanceof Response) return raw;
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "入力が正しくありません");
  try {
    const record = await getListing(userId, parsed.data.placeId);
    if (!record) return badRequest("先に基本情報を保存してください");
    const result = await recheckListing(userId, record, { force: true, notify: false, deadline: Date.now() + 100_000 });
    if (result.lines.length === 0) return badRequest("確認する媒体がありません（状況が「掲載済み」で、掲載ページの URL を控えた媒体が対象です）");
    const body: ListingsRecheckResponse = result;
    return Response.json(body, { headers: NO_STORE });
  } catch (err) {
    return dbErrorResponse(err);
  }
}
