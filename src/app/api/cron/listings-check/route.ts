/**
 * GET /api/cron/listings-check
 * 掲載の生存監視の一斉確認。Vercel の Cron（vercel.json: 毎週火曜 5:00 JST）が叩く。
 *
 * 控えてある掲載ページのうち「次に見に行く時刻」を過ぎたものだけを開き、
 * 店名と電話が今も出ているかを控える。「登録した」ではなく「今も正しく出ている」を
 * 出せるようにするための仕組み（09-19 の調査で「商品価値そのもの」と結論した部分）。
 *
 * maps-refresh と同じく CRON_SECRET で守る。未設定なら一切動かさない。
 */
import { isCronAuthorized, isCronConfigured } from "@/lib/auth/cron";
import { isSupabaseConfigured } from "@/lib/db/supabase";
import { checkListings } from "@/lib/listings/check";
import { dueMediaIds } from "@/lib/listings/monitor";
import { listAllListings, putListing } from "@/lib/listings/store";

export const runtime = "nodejs";
export const maxDuration = 300;

/** 1 回で読む行数（利用者 × 自社店舗）。超えた分は次回 */
const ROW_LIMIT = 500;
/** 1 店舗で見に行く上限。相手の媒体に負荷をかけない */
const MAX_PER_STORE = 10;
/** maxDuration より短く切り上げる（保存の途中で切られないように） */
const BUDGET_MS = 240_000;

export interface ListingsCheckSummary {
  stores: number;
  checked: number;
  live: number;
  problems: number;
  failed: number;
  /** 時間切れで途中までしか見ていないか */
  aborted: boolean;
}

export async function GET(request: Request) {
  if (!isCronConfigured()) {
    return Response.json({ error: "CRON_SECRET が未設定のため生存監視は無効です" }, { status: 503 });
  }
  if (!isCronAuthorized(request)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return Response.json({ error: "Supabase が未設定のため生存監視は無効です" }, { status: 503 });
  }

  const deadline = Date.now() + BUDGET_MS;
  const now = new Date();
  const summary: ListingsCheckSummary = { stores: 0, checked: 0, live: 0, problems: 0, failed: 0, aborted: false };

  for (const row of await listAllListings(ROW_LIMIT)) {
    if (Date.now() > deadline) {
      summary.aborted = true;
      break;
    }
    const due = dueMediaIds(row.states, now).slice(0, MAX_PER_STORE);
    if (due.length === 0) continue;
    summary.stores += 1;
    try {
      const { results, states } = await checkListings(row.profile, row.states, due, { now, budgetMs: Math.max(0, deadline - Date.now()) });
      if (results.length === 0) continue;
      summary.checked += results.length;
      for (const r of results) {
        if (r.result === "live") summary.live += 1;
        else if (r.result === "changed" || r.result === "gone") summary.problems += 1;
      }
      await putListing(row.userId, row.placeId, row.profile, states);
    } catch (err) {
      summary.failed += 1;
      console.error("[listings-check] 店舗の確認に失敗", row.placeId, err);
    }
  }
  console.info("[listings-check]", summary);
  return Response.json(summary, { headers: { "cache-control": "no-store" } });
}
