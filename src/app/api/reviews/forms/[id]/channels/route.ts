/**
 * /api/reviews/forms/[id]/channels … QR の発行単位（店舗別・テーブル別・スタッフ別など）。
 *
 * POST   … { label?, storeName?, placeId?, writeReviewUrl? } → { channels: [作った 1 件] }
 *          店舗を紐づけると、その QR から開いた来店客の画面はその店舗名になり、
 *          投稿ボタンはその店舗の Google マップに飛ぶ（label を省くと店名）。
 *          { bulk: "stores" } → MEO に登録済みの自社店舗のうち、まだ紐づいていない店舗ぶんをまとめて発行
 * DELETE … ?channel=<id>
 */
import { z } from "zod";
import { dbErrorResponse } from "@/lib/db/supabase";
import { listStores } from "@/lib/maps/stores";
import { badRequest, isUuid, NO_STORE, ownedForm, readJson, requireReviewsUser } from "@/lib/reviews/api";
import { addChannel, deleteChannel, listChannels, type ReviewChannel } from "@/lib/reviews/forms";
import { resolveWriteReviewUrl } from "@/lib/reviews/links";
import { CHANNEL_LABEL_MAX, MAX_CHANNELS, STORE_NAME_MAX } from "@/lib/reviews/questions";

export const runtime = "nodejs";
export const maxDuration = 30;

const PLACE_ID = /^[A-Za-z0-9_-]{10,300}$/;

const BodySchema = z.union([
  z.object({ bulk: z.literal("stores") }),
  z
    .object({
      label: z.string().trim().max(CHANNEL_LABEL_MAX).optional(),
      storeName: z.string().trim().max(STORE_NAME_MAX).optional(),
      placeId: z.string().regex(PLACE_ID, "Place ID が正しくありません").optional(),
      writeReviewUrl: z.string().url("投稿 URL の形式が正しくありません").max(500).optional(),
    })
    .refine((b) => (b.label && b.label.length > 0) || (b.storeName && b.storeName.length > 0), {
      message: "ラベルか店名を入力してください",
    }),
]);

export interface ReviewsChannelResponse {
  channels: ReviewChannel[];
}

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Ctx) {
  const userId = await requireReviewsUser();
  if (userId instanceof Response) return userId;
  const { id } = await context.params;
  const raw = await readJson(request);
  if (raw instanceof Response) return raw;
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "入力が正しくありません");

  try {
    const form = await ownedForm(userId, id);
    if (form instanceof Response) return form;
    const existing = await listChannels(form.id);

    if ("bulk" in parsed.data) {
      const linked = new Set(existing.map((c) => c.placeId).filter((p): p is string => p !== null));
      const owns = (await listStores(userId)).filter((s) => s.role === "own" && !linked.has(s.placeId));
      if (owns.length === 0) return badRequest("まとめて発行できる店舗がありません（MEO に自社店舗を登録するか、すべて発行済みです）");
      if (existing.length + owns.length > MAX_CHANNELS) {
        return badRequest(`QR コードは 1 つのアンケートにつき ${MAX_CHANNELS} 件までです（あと ${MAX_CHANNELS - existing.length} 件）`);
      }
      const channels: ReviewChannel[] = [];
      for (const s of owns) {
        const writeReviewUrl = await resolveWriteReviewUrl(userId, s.placeId, null);
        channels.push(await addChannel(form.id, { label: s.name.slice(0, CHANNEL_LABEL_MAX), storeName: s.name, placeId: s.placeId, writeReviewUrl }));
      }
      const body: ReviewsChannelResponse = { channels };
      return Response.json(body, { status: 201, headers: NO_STORE });
    }

    if (existing.length >= MAX_CHANNELS) return badRequest(`QR コードは 1 つのアンケートにつき ${MAX_CHANNELS} 件まで発行できます`);
    const storeName = parsed.data.storeName || null;
    const placeId = parsed.data.placeId ?? null;
    const label = parsed.data.label || (storeName ?? "").slice(0, CHANNEL_LABEL_MAX);
    // 店舗を紐づけないときは、Place ID や URL だけ渡されても投稿先を変えない（本体の店舗のまま）
    const writeReviewUrl = storeName ? await resolveWriteReviewUrl(userId, placeId, parsed.data.writeReviewUrl ?? null) : null;
    const channel = await addChannel(form.id, { label, storeName, placeId: storeName ? placeId : null, writeReviewUrl });
    const body: ReviewsChannelResponse = { channels: [channel] };
    return Response.json(body, { status: 201, headers: NO_STORE });
  } catch (err) {
    return dbErrorResponse(err);
  }
}

export async function DELETE(request: Request, context: Ctx) {
  const userId = await requireReviewsUser();
  if (userId instanceof Response) return userId;
  const { id } = await context.params;
  const channelId = new URL(request.url).searchParams.get("channel") ?? "";
  if (!isUuid(channelId)) return badRequest("QR の ID が正しくありません");
  try {
    const form = await ownedForm(userId, id);
    if (form instanceof Response) return form;
    const ok = await deleteChannel(form.id, channelId);
    if (!ok) return Response.json({ error: "その QR は見つかりません" }, { status: 404 });
    return new Response(null, { status: 204, headers: NO_STORE });
  } catch (err) {
    return dbErrorResponse(err);
  }
}
