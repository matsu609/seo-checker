/**
 * /api/reviews/forms/[id]/channels … QR の発行単位（店舗別・テーブル別・スタッフ別など）。
 *
 * POST   … { label } → { channel }
 * DELETE … ?channel=<id>
 */
import { z } from "zod";
import { dbErrorResponse } from "@/lib/db/supabase";
import { badRequest, isUuid, NO_STORE, ownedForm, readJson, requireReviewsUser } from "@/lib/reviews/api";
import { addChannel, deleteChannel, listChannels, type ReviewChannel } from "@/lib/reviews/forms";
import { CHANNEL_LABEL_MAX, MAX_CHANNELS } from "@/lib/reviews/questions";

export const runtime = "nodejs";
export const maxDuration = 30;

const BodySchema = z.object({
  label: z.string().trim().min(1, "ラベルを入力してください").max(CHANNEL_LABEL_MAX),
});

export interface ReviewsChannelResponse {
  channel: ReviewChannel;
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
    if (existing.length >= MAX_CHANNELS) return badRequest(`QR コードは 1 つのアンケートにつき ${MAX_CHANNELS} 件まで発行できます`);
    const body: ReviewsChannelResponse = { channel: await addChannel(form.id, parsed.data.label) };
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
