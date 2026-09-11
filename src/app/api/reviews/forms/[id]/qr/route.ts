/**
 * /api/reviews/forms/[id]/qr?c=<code>&format=svg|png&download=1 … QR コードの画像（店舗側、ログイン必須）。
 *
 * download=1 なら添付（ファイル名は「QR_<店名（ラベル）>.svg」。日本語は RFC 5987 で付け、ASCII の代替名も添える）。
 * 無ければインライン（画面のプレビュー用）。
 *
 * 中身は `https://<このアプリ>/r/<slug>?c=<code>`。サーバーで描くのでブラウザに依存を配らない。
 * 印刷用に SVG（拡大しても荒れない）と PNG（1024px）の両方を返す。
 */
import QRCode from "qrcode";
import { dbErrorResponse } from "@/lib/db/supabase";
import { badRequest, NO_STORE, ownedForm, requireReviewsUser } from "@/lib/reviews/api";
import { channelDisplayName, findChannelByCode, isValidChannelCode } from "@/lib/reviews/forms";
import { contentDisposition, originOf, surveyPath } from "@/lib/reviews/url";

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
  const download = url.searchParams.get("download") === "1";
  if (code && !isValidChannelCode(code)) return badRequest("QR のコードが正しくありません");

  try {
    const form = await ownedForm(userId, id);
    if (form instanceof Response) return form;
    let display = form.storeName;
    if (code) {
      const channel = await findChannelByCode(form.id, code);
      if (!channel) return Response.json({ error: "その QR は見つかりません" }, { status: 404 });
      display = channelDisplayName(channel);
    }
    const target = `${originOf(request)}${surveyPath(form.slug, code || null)}`;
    const disposition = contentDisposition(download, `QR_${display}`, `qr-${form.slug}${code ? `-${code}` : ""}`, format);
    if (format === "png") {
      const buffer = await QRCode.toBuffer(target, { type: "png", width: 1024, margin: 2, errorCorrectionLevel: "M" });
      return new Response(new Uint8Array(buffer), {
        headers: { ...NO_STORE, "content-type": "image/png", "content-disposition": disposition },
      });
    }
    const svg = await QRCode.toString(target, { type: "svg", margin: 2, errorCorrectionLevel: "M" });
    return new Response(svg, {
      headers: { ...NO_STORE, "content-type": "image/svg+xml; charset=utf-8", "content-disposition": disposition },
    });
  } catch (err) {
    return dbErrorResponse(err);
  }
}
