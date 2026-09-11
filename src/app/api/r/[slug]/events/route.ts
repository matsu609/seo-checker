/**
 * POST /api/r/[slug]/events … 「Google マップに投稿する」を押した記録（ログイン不要）。
 *
 * 本文: { responseId, token, draftFinal? }。token は回答時に返したもの。
 * Google 側で実際に投稿されたかは分からない（コールバックが無い）ので、記録できるのは押下まで。
 * 画面遷移の直前に fetch(keepalive) で送る。
 */
import { z } from "zod";
import { dbErrorResponse } from "@/lib/db/supabase";
import { clientKeyOf, REVIEW_CLIENT_LIMIT_MESSAGE, REVIEW_EVENT_PER_HOUR, takeClientToken } from "@/lib/free/ratelimit";
import { getPublicForm, isValidSlug } from "@/lib/reviews/forms";
import { DRAFT_MAX } from "@/lib/reviews/questions";
import { isValidEditToken, markReviewClicked } from "@/lib/reviews/responses";

export const runtime = "nodejs";
export const maxDuration = 15;

const NO_STORE = { "cache-control": "no-store" } as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BodySchema = z.object({
  responseId: z.string().regex(UUID),
  token: z.string().refine(isValidEditToken),
  draftFinal: z.string().max(DRAFT_MAX).optional(),
});

type Ctx = { params: Promise<{ slug: string }> };

export async function POST(request: Request, context: Ctx) {
  const { slug } = await context.params;
  if (!isValidSlug(slug)) return Response.json({ error: "このアンケートは見つかりません" }, { status: 404, headers: NO_STORE });
  if (!takeClientToken("review-event", clientKeyOf(request), REVIEW_EVENT_PER_HOUR)) {
    return Response.json({ error: REVIEW_CLIENT_LIMIT_MESSAGE, code: "rate_limited" }, { status: 429, headers: NO_STORE });
  }
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "リクエスト形式が不正です" }, { status: 400, headers: NO_STORE });
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) return Response.json({ error: "入力が正しくありません" }, { status: 400, headers: NO_STORE });

  try {
    const form = await getPublicForm(slug);
    if (!form) return Response.json({ error: "このアンケートは見つかりません" }, { status: 404, headers: NO_STORE });
    const draftFinal = parsed.data.draftFinal === undefined ? null : parsed.data.draftFinal.trim();
    const updated = await markReviewClicked(form.id, parsed.data.responseId, parsed.data.token, draftFinal);
    if (!updated) return Response.json({ error: "回答が見つかりません" }, { status: 404, headers: NO_STORE });
    return Response.json({ ok: true }, { headers: NO_STORE });
  } catch (err) {
    return dbErrorResponse(err);
  }
}
