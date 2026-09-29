/**
 * POST /api/billing/promo … 割引コードの確認。本文: { code }。
 * 応答: { code, label }（正規化したコードと説明）。無効なら 404。1 人 1 時間 10 回まで（超えたら 429）。
 *
 * ここは説明を返すだけで、割引の適用は /api/billing/checkout がコードを再検証して行う。
 */
import { z } from "zod";
import { requireUser } from "@/lib/auth/guard";
import { normalizeCode, patternLabel, resolvePromoCode } from "@/lib/billing/promo";
import { promoLimitResponse, takePromoAttempt } from "@/lib/billing/promo-limit";
import { isStripeConfigured } from "@/lib/billing/stripe";
import { NO_STORE } from "@/lib/api/headers";

export const runtime = "nodejs";
export const maxDuration = 10;

/** 本文の形。null や数値が来ても 500 にせず 400 で返す（2026-09-23） */
const BodySchema = z.object({ code: z.string().max(200) });

export async function POST(request: Request) {
  const userId = await requireUser({ headers: NO_STORE });
  if (userId instanceof Response) return userId;
  if (!isStripeConfigured()) return Response.json({ error: "決済が設定されていません" }, { status: 503, headers: NO_STORE });
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  const code = parsed.success ? normalizeCode(parsed.data.code).slice(0, 64) : "";
  if (!code) return Response.json({ error: "割引コードを入力してください" }, { status: 400, headers: NO_STORE });
  // 総当たりで有効なコードを探せないよう、確かめる前に 1 回ぶん数える（申し込みの API と同じ枠）
  if (!takePromoAttempt(userId)) return promoLimitResponse();
  const pattern = resolvePromoCode(code);
  if (!pattern) return Response.json({ error: "この割引コードは使えません。コードをお確かめください" }, { status: 404, headers: NO_STORE });
  return Response.json({ code, label: patternLabel(pattern) }, { headers: NO_STORE });
}
