/**
 * POST /api/site-report — GA4 の KPI（当期・前期）とチャネル別の日次セッションを返す。
 *
 * 順位・ファインダビリティスコアはブラウザに貯めた順位計測の履歴から計算するので、
 * このルートは GA4 だけを見る（サーバーは状態を持たない）。
 * GA4 が未設定なら 503 と足りない環境変数名を返し、ダミーの数字は絶対に返さない。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guard";
import { globalCache } from "@/lib/cache";
import { ga4UnavailableMessage, resolveGa4Client } from "@/lib/google/ga4";
import { daysInRange, isIsoDate, previousRange, type DateRange } from "@/lib/ga4/period";
import { Ga4Error } from "@/lib/ga4/types";
import { fetchSiteReport } from "@/lib/site-report/report";
import type { SiteReportResponse } from "@/lib/site-report/types";

export const runtime = "nodejs";
/** GA4 を 3 本並列で叩く。応答が遅いことがあるので既定の 60 秒より長めに取る */
export const maxDuration = 120;

/** 1 回で取れる期間の上限（日）。これ以上は日次の行数が増えすぎる */
const MAX_DAYS = 365;
/** 同じ期間を短時間に取り直しても GA4 の割り当てを減らさない */
const CACHE_TTL_MS = 10 * 60 * 1000;

const reportCache = globalCache<SiteReportResponse>("siteReport", CACHE_TTL_MS, 20);

const BodySchema = z.object({
  startDate: z.string().min(1).max(10),
  endDate: z.string().min(1).max(10),
  previousStartDate: z.string().min(1).max(10).optional(),
  previousEndDate: z.string().min(1).max(10).optional(),
});

function invalid(message: string): Response {
  return Response.json({ error: message }, { status: 422 });
}

export async function POST(request: NextRequest) {
  // ハンドラ内でも検証する（proxy.ts のマッチャ変更でカバーが外れても止める）
  const denied = await requireAuth();
  if (denied) return denied;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "リクエスト形式が不正です" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return invalid("入力が不正です（startDate と endDate は YYYY-MM-DD 形式で必須です）");
  }
  const { startDate, endDate, previousStartDate, previousEndDate } = parsed.data;
  if (!isIsoDate(startDate) || !isIsoDate(endDate)) {
    return invalid("期間は YYYY-MM-DD 形式で指定してください");
  }
  if (startDate > endDate) {
    return invalid("開始日は終了日より前の日付にしてください");
  }
  const range: DateRange = { startDate, endDate };
  if (daysInRange(range) > MAX_DAYS) {
    return invalid(`期間が長すぎます（${MAX_DAYS} 日以内で指定してください）`);
  }

  let previous: DateRange;
  if (previousStartDate || previousEndDate) {
    if (!previousStartDate || !previousEndDate) {
      return invalid("前期は開始日と終了日の両方を指定してください");
    }
    if (!isIsoDate(previousStartDate) || !isIsoDate(previousEndDate)) {
      return invalid("前期は YYYY-MM-DD 形式で指定してください");
    }
    if (previousStartDate > previousEndDate) {
      return invalid("前期の開始日は終了日より前の日付にしてください");
    }
    previous = { startDate: previousStartDate, endDate: previousEndDate };
  } else {
    previous = previousRange(range);
  }

  // GA4 が未設定 / サービスアカウント JSON が壊れている
  let client;
  try {
    client = (await resolveGa4Client())?.client ?? null;
  } catch (err) {
    if (err instanceof Ga4Error) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
  if (!client) {
    return Response.json({ error: ga4UnavailableMessage("サイトレポート") }, { status: 503 });
  }

  const cacheKey = `${client.propertyId}|${range.startDate}|${range.endDate}|${previous.startDate}|${previous.endDate}`;
  const cached = reportCache.get(cacheKey);
  if (cached) return Response.json({ ...cached, cached: true });

  try {
    const report = await fetchSiteReport(client, { range, previous });
    reportCache.set(cacheKey, report);
    return Response.json(report);
  } catch (err) {
    if (err instanceof Ga4Error) {
      return Response.json({ error: err.message }, { status: err.status });
    }
    console.error("[site-report] unexpected error", err);
    return Response.json({ error: "レポートの取得に失敗しました" }, { status: 500 });
  }
}
