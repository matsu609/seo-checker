/**
 * POST /api/billing/promo … 割引コードの確認。本文: { code }。
 * 応答: { code, label }（正規化したコードと説明）。無効なら 404。
 *
 * ここは説明を返すだけで、割引の適用は /api/billing/checkout がコードを再検証して行う。
 */
import { requireAuth } from "@/lib/auth/guard";
import { normalizeCode, patternLabel, resolvePromoCode } from "@/lib/billing/promo";
import { isStripeConfigured } from "@/lib/billing/stripe";

export const runtime = "nodejs";
export const maxDuration = 10;

const NO_STORE = { "cache-control": "no-store" } as const;

export async function POST(request: Request) {
  const denied = await requireAuth();
  if (denied) return denied;
  if (!isStripeConfigured()) return Response.json({ error: "決済が設定されていません" }, { status: 503, headers: NO_STORE });
  const body = (await request.json().catch(() => ({}))) as { code?: unknown };
  const raw = typeof body.code === "string" ? body.code : "";
  const code = normalizeCode(raw).slice(0, 64);
  if (!code) return Response.json({ error: "割引コードを入力してください" }, { status: 400, headers: NO_STORE });
  const pattern = resolvePromoCode(code);
  if (!pattern) return Response.json({ error: "この割引コードは使えません。コードをお確かめください" }, { status: 404, headers: NO_STORE });
  return Response.json({ code, label: patternLabel(pattern) }, { headers: NO_STORE });
}
