/**
 * POST /api/r/[slug]/direct … 「お店に直接伝える」（ログイン不要）。
 *
 * 本文: { responseId, token, message, contact? }。token は回答時に返したもの。
 * 店舗の管理画面で「直接連絡あり」として先頭に出る。連絡先は任意。
 */
import { z } from "zod";
import { dbErrorResponse } from "@/lib/db/supabase";
import { clientKeyOf, REVIEW_CLIENT_LIMIT_MESSAGE, REVIEW_EVENT_PER_HOUR, takeClientToken } from "@/lib/free/ratelimit";
import { getPublicForm, isValidSlug } from "@/lib/reviews/forms";
import { DIRECT_CONTACT_MAX, DIRECT_MESSAGE_MAX } from "@/lib/reviews/questions";
import { isValidEditToken, saveDirectMessage } from "@/lib/reviews/responses";

export const runtime = "nodejs";
export const maxDuration = 15;

const NO_STORE = { "cache-control": "no-store" } as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BodySchema = z.object({
  responseId: z.string().regex(UUID),
  token: z.string().refine(isValidEditToken),
  message: z.string().trim().min(1, "お伝えしたい内容を入力してください").max(DIRECT_MESSAGE_MAX),
  contact: z.string().trim().max(DIRECT_CONTACT_MAX).optional(),
});

type Ctx = { params: Promise<{ slug: string }> };

export async function POST(request: Request, context: Ctx) {
  const { slug } = await context.params;
  if (!isValidSlug(slug)) return Response.json({ error: "このアンケートは見つかりません" }, { status: 404, headers: NO_STORE });
  if (!takeClientToken("review-direct", clientKeyOf(request), REVIEW_EVENT_PER_HOUR)) {
    return Response.json({ error: REVIEW_CLIENT_LIMIT_MESSAGE, code: "rate_limited" }, { status: 429, headers: NO_STORE });
  }
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "リクエスト形式が不正です" }, { status: 400, headers: NO_STORE });
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "入力が正しくありません" }, { status: 400, headers: NO_STORE });
  }

  try {
    const form = await getPublicForm(slug);
    if (!form) return Response.json({ error: "このアンケートは見つかりません" }, { status: 404, headers: NO_STORE });
    const contact = parsed.data.contact?.trim() || null;
    const updated = await saveDirectMessage(form.id, parsed.data.responseId, parsed.data.token, parsed.data.message, contact);
    if (!updated) return Response.json({ error: "回答が見つかりません" }, { status: 404, headers: NO_STORE });
    return Response.json({ ok: true }, { headers: NO_STORE });
  } catch (err) {
    return dbErrorResponse(err);
  }
}
