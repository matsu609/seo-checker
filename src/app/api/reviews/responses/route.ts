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
import { listResponses, RESPONSE_STATUSES, RESPONSES_LIMIT, type ListFilter, type ResponseStatus, type ReviewResponse } from "@/lib/reviews/responses";

export const runtime = "nodejs";
export const maxDuration = 30;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface ReviewsResponsesResponse {
  responses: ReviewResponse[];
  channels: ReviewChannel[];
  metrics: ReviewMetrics;
  limit: number;
}

/** 日付（JST の 0:00）→ ISO。to は翌日 0:00 */
function jstStart(date: string, addDays = 0): string {
  const d = new Date(`${date}T00:00:00+09:00`);
  d.setUTCDate(d.getUTCDate() + addDays);
  return d.toISOString();
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
  if (from) {
    if (!DATE.test(from)) return badRequest("開始日の形式が正しくありません");
    filter.from = jstStart(from);
  }
  if (to) {
    if (!DATE.test(to)) return badRequest("終了日の形式が正しくありません");
    filter.to = jstStart(to, 1);
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
