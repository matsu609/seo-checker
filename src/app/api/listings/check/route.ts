/**
 * POST /api/listings/check … 掲載の生存監視を今すぐ走らせる。
 *
 * 控えてある掲載ページを実際に開いて、店名と電話が今も出ているかを確かめ、
 * 最終確認日時・次回・結果を保存する。「登録した」ではなく「今も正しく出ている」を出せるようにするため。
 *
 * 本文: { placeId, mediaIds?, dueOnly? }
 * 応答: { results, record }
 */
import { z } from "zod";
import { dbErrorResponse } from "@/lib/db/supabase";
import { badRequest, NO_STORE, PLACE_ID, readJson, requireListingsUser } from "@/lib/listings/api";
import { checkListings, type ListingCheckResult } from "@/lib/listings/check";
import { dueMediaIds, isCheckable } from "@/lib/listings/monitor";
import { stateOf } from "@/lib/listings/profile";
import { getListing, putListing, type ListingRecord } from "@/lib/listings/store";
import { listStores } from "@/lib/maps/stores";

export const runtime = "nodejs";
export const maxDuration = 120;

/** 1 回の実行で見に行く上限（相手の媒体に負荷をかけない） */
const MAX_PER_RUN = 15;
const BUDGET_MS = 90_000;

const BodySchema = z.object({
  placeId: z.string().regex(PLACE_ID, "店舗の ID が正しくありません"),
  /** 媒体を名指しするとき */
  mediaIds: z.array(z.string().max(64)).max(60).optional(),
  /** true なら「次に見に行く時刻」を過ぎたものだけ（既定は控えてある全部） */
  dueOnly: z.boolean().default(false),
});

export interface ListingsCheckResponse {
  results: ListingCheckResult[];
  record: ListingRecord;
}

export async function POST(request: Request) {
  const userId = await requireListingsUser();
  if (userId instanceof Response) return userId;
  const raw = await readJson(request);
  if (raw instanceof Response) return raw;
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "入力が正しくありません");
  const { placeId, mediaIds, dueOnly } = parsed.data;

  try {
    const own = (await listStores(userId)).some((s) => s.role === "own" && s.placeId === placeId);
    if (!own) return Response.json({ error: "その店舗は MEO の自社店舗に登録されていません" }, { status: 404 });
    const record = await getListing(userId, placeId);
    if (!record) return badRequest("先に基本情報を保存してください");

    const now = new Date();
    const candidates = (mediaIds && mediaIds.length > 0 ? mediaIds : dueOnly ? dueMediaIds(record.states, now) : Object.keys(record.states))
      .filter((id) => isCheckable(stateOf(record.states, id)))
      .slice(0, MAX_PER_RUN);
    if (candidates.length === 0) {
      return badRequest("確認できる掲載ページがありません。媒体一覧で掲載ページの URL を控えてください。");
    }

    const { results, states } = await checkListings(record.profile, record.states, candidates, { now, budgetMs: BUDGET_MS });
    const saved = results.length > 0 ? await putListing(userId, placeId, record.profile, states) : record;
    const body: ListingsCheckResponse = { results, record: saved };
    return Response.json(body, { headers: NO_STORE });
  } catch (err) {
    return dbErrorResponse(err);
  }
}
