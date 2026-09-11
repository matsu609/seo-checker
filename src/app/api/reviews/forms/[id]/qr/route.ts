/**
 * /api/reviews/forms/[id]/qr?c=<code>&format=svg|png … QR コードの画像（店舗側、ログイン必須）。
 *
 * 中身は `https://<このアプリ>/r/<slug>?c=<code>`。サーバーで描くのでブラウザに依存を配らない。
 * 印刷用に SVG（拡大しても荒れない）と PNG（1024px）の両方を返す。
 */
import QRCode from "qrcode";
import { dbErrorResponse } from "@/lib/db/supabase";
import { badRequest, NO_STORE, ownedForm, requireReviewsUser } from "@/lib/reviews/api";
import { findChannelByCode, isValidChannelCode } from "@/lib/reviews/forms";
import { originOf, surveyPath } from "@/lib/reviews/url";

export const runtime = "nodejs";
export const maxDuration = 30;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Ctx) {
  const userId = await requireReviewsUser();
  if (userId instanceof Response) return userId;
  const { id } = await context.params;
  const url = new URL(request.url);
  const code = url.searchParams.get("c") ?? "";
  const format = url.searchParams.get("format") === "png" ? "png" : "svg";
  if (code && !isValidChannelCode(code)) return badRequest("QR のコードが正しくありません");

  try {
    const form = await ownedForm(userId, id);
    if (form instanceof Response) return form;
    if (code) {
      const channel = await findChannelByCode(form.id, code);
      if (!channel) return Response.json({ error: "その QR は見つかりません" }, { status: 404 });
    }
    const target = `${originOf(request)}${surveyPath(form.slug, code || null)}`;
    const name = `qr-${form.slug}${code ? `-${code}` : ""}`;
    if (format === "png") {
      const buffer = await QRCode.toBuffer(target, { type: "png", width: 1024, margin: 2, errorCorrectionLevel: "M" });
      return new Response(new Uint8Array(buffer), {
        headers: { ...NO_STORE, "content-type": "image/png", "content-disposition": `inline; filename="${name}.png"` },
      });
    }
    const svg = await QRCode.toString(target, { type: "svg", margin: 2, errorCorrectionLevel: "M" });
    return new Response(svg, {
      headers: { ...NO_STORE, "content-type": "image/svg+xml; charset=utf-8", "content-disposition": `inline; filename="${name}.svg"` },
    });
  } catch (err) {
    return dbErrorResponse(err);
  }
}
