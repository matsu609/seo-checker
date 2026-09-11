/**
 * PUT /api/listings/profile … 基本情報と掲載状況を保存する（上書き）。
 *
 * 本文: { placeId, profile, states }。placeId は MEO の自社店舗であること（他人の店舗や未登録の店舗には保存しない）。
 * 応答: { record }
 */
import { z } from "zod";
import { dbErrorResponse } from "@/lib/db/supabase";
import { badRequest, NO_STORE, PLACE_ID, readJson, requireListingsUser } from "@/lib/listings/api";
import { mediaById } from "@/lib/listings/media";
import { ListingProfileSchema, ListingStatesSchema } from "@/lib/listings/profile";
import { putListing, type ListingRecord } from "@/lib/listings/store";
import { listStores } from "@/lib/maps/stores";

export const runtime = "nodejs";
export const maxDuration = 15;

const BodySchema = z.object({
  placeId: z.string().regex(PLACE_ID, "店舗の ID が正しくありません"),
  profile: ListingProfileSchema,
  states: ListingStatesSchema.default({}),
});

export interface ListingsProfileResponse {
  record: ListingRecord;
}

export async function PUT(request: Request) {
  const userId = await requireListingsUser();
  if (userId instanceof Response) return userId;
  const raw = await readJson(request);
  if (raw instanceof Response) return raw;
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "入力が正しくありません");
  const { placeId, profile } = parsed.data;
  if (profile.website && !/^https?:\/\//.test(profile.website)) return badRequest("サイトの URL は https:// から入力してください");
  // 知らない媒体の状況は捨てる（画面のバグや古い媒体 ID で行が膨らまないように）
  const states = Object.fromEntries(Object.entries(parsed.data.states).filter(([id]) => mediaById(id) !== null));

  try {
    const own = (await listStores(userId)).some((s) => s.role === "own" && s.placeId === placeId);
    if (!own) return Response.json({ error: "その店舗は MEO の自社店舗に登録されていません" }, { status: 404 });
    const record = await putListing(userId, placeId, profile, states);
    const body: ListingsProfileResponse = { record };
    return Response.json(body, { headers: NO_STORE });
  } catch (err) {
    return dbErrorResponse(err);
  }
}
