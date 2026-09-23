/**
 * /api/reviews/responses?formId=…&status=&low=1&channel=&from=YYYY-MM-DD&to=YYYY-MM-DD&format=csv
 * … 回答の一覧と集計（店舗側、ログイン必須）。
 *
 * 新しい順に最大 RESPONSES_LIMIT 件。集計（metrics）もその範囲。format=csv なら CSV ファイル。
 */
import { dbErrorResponse } from "@/lib/db/supabase";
import { badRequest, isUuid, NO_STORE, ownedForm, requireReviewsUser } from "@/lib/reviews/api";
import { responsesToCsv } from "@/lib/reviews/csv";
import { listChannels, type ReviewChannel } from "@/lib/reviews/forms";
import { computeMetrics, type ReviewMetrics } from "@/lib/reviews/metrics";
import { jstDayStartIso } from "@/lib/reviews/range";
import { listResponses, RESPONSE_STATUSES, RESPONSES_LIMIT, type ListFilter, type ResponseStatus, type ReviewResponse } from "@/lib/reviews/responses";

export const runtime = "nodejs";
export const maxDuration = 30;

export interface ReviewsResponsesResponse {
  responses: ReviewResponse[];
  channels: ReviewChannel[];
  metrics: ReviewMetrics;
  limit: number;
}

export async function GET(request: Request) {
  const userId = await requireReviewsUser();
  if (userId instanceof Response) return userId;
  const params = new URL(request.url).searchParams;
  const formId = params.get("formId") ?? "";
  if (!isUuid(formId)) return badRequest("アンケートの ID が正しくありません");

  const filter: ListFilter = {};
  const status = params.get("status");
  if (status) {
    if (!(RESPONSE_STATUSES as readonly string[]).includes(status)) return badRequest("対応状態の値が正しくありません");
    filter.status = status as ResponseStatus;
  }
  if (params.get("low") === "1") filter.lowOnly = true;
  const channel = params.get("channel");
  if (channel) {
    if (!isUuid(channel)) return badRequest("QR の ID が正しくありません");
    filter.channelId = channel;
  }
  const from = params.get("from");
  const to = params.get("to");
  // 日付は JST の 0:00（to は翌日 0:00 未満）。存在しない日付（2026-13-01 など）は 400
  // （2026-09-23 まで 13 月は検証の外で RangeError になり 500 を返していた）
  if (from) {
    const iso = jstDayStartIso(from);
    if (!iso) return badRequest("開始日の形式が正しくありません");
    filter.from = iso;
  }
  if (to) {
    const iso = jstDayStartIso(to, 1);
    if (!iso) return badRequest("終了日の形式が正しくありません");
    filter.to = iso;
  }

  try {
    const form = await ownedForm(userId, formId);
    if (form instanceof Response) return form;
    const [responses, channels] = await Promise.all([listResponses(form.id, filter), listChannels(form.id)]);
    if (params.get("format") === "csv") {
      const csv = responsesToCsv(responses, form, channels);
      return new Response(csv, {
        headers: {
          ...NO_STORE,
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="responses-${form.slug}.csv"`,
        },
      });
    }
    const body: ReviewsResponsesResponse = { responses, channels, metrics: computeMetrics(responses, channels), limit: RESPONSES_LIMIT };
    return Response.json(body, { headers: NO_STORE });
  } catch (err) {
    return dbErrorResponse(err);
  }
}
