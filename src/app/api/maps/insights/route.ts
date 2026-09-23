/**
 * GET /api/maps/insights?placeId=… — 口コミの傾向（D）とサイトとの表記ゆれ（E）。精密診断のみ。
 *
 * 口コミの傾向: 保存済みの報告書に貯まった口コミをまとめて集計する（Google への追加の
 * 呼び出しは無い）。表記ゆれ: 登録サイトを自分のクローラで 1 ページ読むだけ（費用ゼロ）。
 * どちらも失敗しても診断そのものは止めない（null を返して画面側が「調べられません」と出す）。
 */
import { FetchError } from "@/lib/analyzer/fetch";
import { fetchText } from "@/lib/analyzer/fetch";
import { requireAuth } from "@/lib/auth/guard";
import { currentUserId } from "@/lib/auth/user";
import { globalCache } from "@/lib/cache";
import { dbErrorResponse, isSupabaseConfigured } from "@/lib/db/supabase";
import { allReportsForPlace } from "@/lib/maps/history";
import { checkSiteNap, extractSiteNap, type NapResult, type SiteNapSnapshot } from "@/lib/maps/nap";
import { analyzeReviews, collectReviews, type ReviewInsights } from "@/lib/maps/review-insights";

export const runtime = "nodejs";
export const maxDuration = 30;

const PLACE_ID = /^[A-Za-z0-9_-]{10,300}$/;
/**
 * サイトの読み取りは 6 時間キャッシュ（同じ店舗を何度も開いても相手サイトを叩かない）。
 * キャッシュするのは読み取った NAP だけで、店舗の値との比較は毎回する（2026-09-23。以前は比較の結果を
 * URL だけのキーで持ち、同じサイトの別店舗・別の利用者に違う店舗の比較が出ていた）。
 */
const siteCache = globalCache<SiteNapSnapshot>("maps-nap-site", 6 * 60 * 60 * 1000, 100);
const SITE_TIMEOUT_MS = 8_000;

/** 登録サイトを取得できなかった（画面に出す理由を持つ） */
class SiteUnavailableError extends Error {}

export interface MapsInsightsResponse {
  enabled: boolean;
  /** 集計に使った報告書の件数（= 保存された週の数） */
  reports: number;
  insights: ReviewInsights | null;
  nap: NapResult | null;
  /** 表記ゆれを調べられなかった理由（サイト未登録・取得失敗） */
  napNote: string | null;
}

export async function GET(request: Request) {
  const denied = await requireAuth({ feature: "maps" });
  if (denied) return denied;

  const headers = { "cache-control": "no-store" };
  const placeId = new URL(request.url).searchParams.get("placeId");
  if (!placeId || !PLACE_ID.test(placeId)) {
    return Response.json({ error: "店舗の ID が正しくありません" }, { status: 400, headers });
  }
  if (!isSupabaseConfigured()) {
    const body: MapsInsightsResponse = { enabled: false, reports: 0, insights: null, nap: null, napNote: null };
    return Response.json(body, { headers });
  }
  const userId = await currentUserId();
  if (!userId) return Response.json({ error: "ログインが必要です" }, { status: 401, headers });

  try {
    const reports = await allReportsForPlace(userId, placeId);
    if (reports.length === 0) {
      const body: MapsInsightsResponse = { enabled: true, reports: 0, insights: null, nap: null, napNote: null };
      return Response.json(body, { headers });
    }
    const insights = analyzeReviews(collectReviews(reports.map((r) => r.detail.reviews ?? [])));

    const detail = reports[0].detail;
    let nap: NapResult | null = null;
    let napNote: string | null = null;
    if (!detail.website) {
      napNote = "ビジネス プロフィールにウェブサイトが登録されていないため、表記ゆれは調べられません。";
    } else {
      try {
        nap = await checkSiteNap(
          { ...detail, website: detail.website },
          async (url) => {
            const res = await fetchText(url, { timeoutMs: SITE_TIMEOUT_MS });
            if (!res.ok || !res.body) throw new SiteUnavailableError(`登録サイトを取得できませんでした（HTTP ${res.status || "接続不可"}）。`);
            return { site: extractSiteNap(res.body), url: res.finalUrl, fetchedAt: new Date().toISOString() };
          },
          siteCache,
        );
      } catch (err) {
        napNote =
          err instanceof SiteUnavailableError
            ? err.message
            : err instanceof FetchError
              ? `登録サイトを取得できませんでした（${err.message}）。`
              : "登録サイトを取得できませんでした。";
      }
    }

    const body: MapsInsightsResponse = { enabled: true, reports: reports.length, insights, nap, napNote };
    return Response.json(body, { headers });
  } catch (err) {
    const res = dbErrorResponse(err);
    if (res) return res;
    console.error("[maps/insights] unexpected error", err);
    return Response.json({ error: "傾向を集計できませんでした" }, { status: 500, headers });
  }
}
