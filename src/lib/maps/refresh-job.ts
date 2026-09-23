/**
 * マップ診断の一斉更新を「本物の依存」で組み立てて動かす。サーバー専用。
 *
 * 呼び出し元は 2 つ: 日次の Cron（/api/cron/daily の月曜分）と、旧パスの /api/cron/maps-refresh
 * （手動で叩けるように残してある）。中身はどちらも同じ。
 */
import { accessAllows, loadUserAccess } from "@/lib/plans/user";
import { getPlace } from "./client";
import { enrichOwnReport } from "./enrich";
import { latestReports, saveMeoReport } from "./history";
import { getOwnerInputOrNull } from "./owner-store";
import { refreshStores, type RefreshSummary } from "./refresh";
import { listStoresDue, markRefreshed } from "./stores";

/** 1 回で読む行数（利用者 × 店舗）。超えた分は次回（時間切れと同じ扱い） */
export const MAPS_REFRESH_ROW_LIMIT = 2000;

export async function runMapsRefresh(options: { limit?: number; budgetMs: number; signal?: AbortSignal }): Promise<RefreshSummary> {
  return refreshStores(
    {
      listDue: listStoresDue,
      getDetail: getPlace,
      save: (userId, report) => saveMeoReport(userId, { ...report, aiCommentary: null }),
      markRefreshed,
      getOwnerInput: getOwnerInputOrNull,
      // 契約の無い人（解約・プラン変更）のために Places を呼ばない（2026-09-23。投稿・順位・監視の定期処理と同じ判定）
      allowsUser: async (userId) => accessAllows(await loadUserAccess(userId), "maps"),
      // 検索順位は毎週取り直し（前回の順位を previous に）、周辺の同業も毎週取り直す
      enrich: async (userId, detail, owner) => {
        const previous = (await latestReports(userId, [detail.id])).get(detail.id)?.report ?? null;
        return enrichOwnReport(userId, detail, owner?.input.keywords ?? [], { previous, refreshArea: true });
      },
    },
    { limit: options.limit ?? MAPS_REFRESH_ROW_LIMIT, budgetMs: options.budgetMs },
  );
}
