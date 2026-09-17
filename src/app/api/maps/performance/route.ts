/**
 * GET /api/maps/performance?placeId=…&month=YYYY-MM … Google での見られ方（ビジネス プロフィールのインサイト）。
 *
 * オーナー権限（business.manage）が要る。接続していない・権限が無い・その店舗を管理していない、は
 * エラーではなく `enabled: false` と理由で返し、画面が接続ボタンを出す。
 * 1 回 = Performance API 3 リクエスト。同じ利用者・店舗・月は 6 時間キャッシュ。
 */
import { isAuthEnabled } from "@/lib/auth/config";
import { requireAuth } from "@/lib/auth/guard";
import { currentUserId } from "@/lib/auth/user";
import { globalCache } from "@/lib/cache";
import { listAllLocations } from "@/lib/google/business-profile";
import { GoogleLinkError, googleErrorResponse } from "@/lib/google/errors";
import { defaultReportMonth, fetchPerformanceSummary, isMonthKey, shiftMonth, type PerformanceSummary } from "@/lib/google/performance";
import { canUse } from "@/lib/google/scopes";
import { getGoogleConnection } from "@/lib/google/token";

export const runtime = "nodejs";
export const maxDuration = 60;

const PLACE_ID = /^[A-Za-z0-9_-]{10,300}$/;
const cache = globalCache<PerformanceSummary>("maps-performance", 6 * 60 * 60 * 1000, 200);

export type PerformanceDisabledReason =
  /** Clerk が無い環境（開発） */
  | "auth_disabled"
  /** Google アカウントを接続していない */
  | "not_connected"
  /** 接続はあるが business.manage が無い */
  | "no_scope"
  /** 接続したアカウントがこの店舗（Place ID）を管理していない */
  | "not_managed";

export interface MapsPerformanceResponse {
  enabled: boolean;
  reason: PerformanceDisabledReason | null;
  /** ビジネス一覧を取れなかった理由（API 未承認など） */
  error: string | null;
  email: string | null;
  month: string;
  /** 選べる月（新しい順、18 か月） */
  months: string[];
  summary: PerformanceSummary | null;
  cached: boolean;
}

export async function GET(request: Request) {
  const denied = await requireAuth({ feature: "maps" });
  if (denied) return denied;
  const headers = { "cache-control": "no-store" };
  const url = new URL(request.url);
  const placeId = url.searchParams.get("placeId") ?? "";
  if (!PLACE_ID.test(placeId)) return Response.json({ error: "店舗の ID が正しくありません" }, { status: 400, headers });
  const requested = url.searchParams.get("month") ?? "";
  const latest = defaultReportMonth();
  const month = isMonthKey(requested) && requested <= latest && requested >= shiftMonth(latest, -17) ? requested : latest;
  const months = Array.from({ length: 18 }, (_, i) => shiftMonth(latest, -i));

  const body: MapsPerformanceResponse = { enabled: false, reason: null, error: null, email: null, month, months, summary: null, cached: false };
  if (!isAuthEnabled()) {
    body.reason = "auth_disabled";
    return Response.json(body, { headers });
  }
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "ログインが必要です" }, { status: 401, headers });

  const connection = await getGoogleConnection();
  body.email = connection.email ?? null;
  if (!connection.connected) {
    body.reason = "not_connected";
    return Response.json(body, { headers });
  }
  if (!canUse(connection.scopes, "business-profile")) {
    body.reason = "no_scope";
    return Response.json(body, { headers });
  }

  const cacheKey = `${userId}|${placeId}|${month}`;
  const cached = cache.get(cacheKey);
  if (cached) return Response.json({ ...body, enabled: true, summary: cached, cached: true }, { headers });

  try {
    const location = (await listAllLocations()).find((l) => l.placeId === placeId) ?? null;
    if (!location) {
      body.reason = "not_managed";
      return Response.json(body, { headers });
    }
    const summary = await fetchPerformanceSummary(location.name, month);
    cache.set(cacheKey, summary);
    return Response.json({ ...body, enabled: true, summary }, { headers });
  } catch (err) {
    // 承認前（403）や一時的な失敗は、画面に理由を出して接続ボタンは出さない
    if (err instanceof GoogleLinkError && (err.code === "forbidden" || err.code === "rate_limited" || err.code === "network")) {
      body.error = err.message;
      return Response.json(body, { headers });
    }
    return googleErrorResponse(err);
  }
}
