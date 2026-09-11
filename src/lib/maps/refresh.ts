/**
 * 週 1 回の一斉更新。
 *
 * 利用者は手動で取り直せない（費用と「いつ見ても同じ数字」の両方のため）。
 * 毎週月曜 5:00（日本時間）に Vercel の Cron が /api/cron/maps-refresh を叩き、
 * 登録された全店舗（自社・競合）の詳細を Google から取り直して履歴に保存する。
 * 同じ店舗が複数の利用者に登録されていても Google には 1 回しか問い合わせない。
 *
 * ここは依存を注入できる純粋なループにして、テストでは Google も DB も使わない。
 */
import { PlacesError } from "./client";
import type { MeoOwnerData } from "./owner-input";
import { buildMeoReport, type MeoReport } from "./report";
import type { MeoStoreRow } from "./stores";
import type { PlaceDetail } from "./types";

/** 更新曜日（0 = 日曜 … 1 = 月曜）と時刻（日本時間） */
export const REFRESH_WEEKDAY = 1;
export const REFRESH_HOUR_JST = 5;
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 次の一斉更新の日時（UTC の Date）。ちょうど更新時刻なら 1 週間後 */
export function nextRefreshAt(now = new Date()): Date {
  // 日本時間の壁時計で計算するため、UTC に 9 時間足した「擬似 UTC」で扱う
  const jst = new Date(now.getTime() + JST_OFFSET_MS);
  const candidate = new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate(), REFRESH_HOUR_JST));
  let days = (REFRESH_WEEKDAY - candidate.getUTCDay() + 7) % 7;
  if (days === 0 && candidate.getTime() <= jst.getTime()) days = 7;
  candidate.setUTCDate(candidate.getUTCDate() + days);
  return new Date(candidate.getTime() - JST_OFFSET_MS);
}

/** 直前の一斉更新の日時（表示用。「この数字は○日時点」） */
export function lastRefreshAt(now = new Date()): Date {
  const next = nextRefreshAt(now);
  return new Date(next.getTime() - 7 * 24 * 60 * 60 * 1000);
}

export interface RefreshDeps {
  /** 更新が古い順に対象を返す */
  listDue: (limit: number) => Promise<MeoStoreRow[]>;
  /** Google から詳細を取り直す */
  getDetail: (placeId: string) => Promise<PlaceDetail>;
  /** 利用者ごとに履歴へ保存 */
  save: (userId: string, report: MeoReport) => Promise<unknown>;
  markRefreshed: (placeId: string, at: Date) => Promise<void>;
  /** 自社店舗のオーナー申告（無ければ null）。省略時は申告なしとして採点 */
  getOwnerInput?: (userId: string, placeId: string) => Promise<MeoOwnerData | null>;
  now?: () => Date;
}

export interface RefreshOptions {
  /** 1 回の実行で読む行数の上限 */
  limit: number;
  /** 使ってよい時間（ms）。超えそうなら残りは次回に回す */
  budgetMs: number;
}

export interface RefreshSummary {
  /** 対象の行数（利用者 × 店舗） */
  rows: number;
  /** Google に問い合わせた店舗数 */
  fetched: number;
  /** 履歴に保存した件数 */
  saved: number;
  /** 見つからなかった等で保存できなかった店舗数 */
  failed: number;
  /** 時間切れで次回に回した店舗数 */
  remaining: number;
  /** 全体を止めたエラー（キー未設定・上限など） */
  aborted: string | null;
}

export async function refreshStores(deps: RefreshDeps, options: RefreshOptions): Promise<RefreshSummary> {
  const now = deps.now ?? (() => new Date());
  const started = now().getTime();
  const rows = await deps.listDue(options.limit);

  // 店舗ごとにまとめる（同じ店舗を複数の利用者が登録していても 1 回で済ませる）
  const byPlace = new Map<string, MeoStoreRow[]>();
  for (const row of rows) {
    const list = byPlace.get(row.place_id) ?? [];
    list.push(row);
    byPlace.set(row.place_id, list);
  }

  const summary: RefreshSummary = { rows: rows.length, fetched: 0, saved: 0, failed: 0, remaining: 0, aborted: null };
  const places = [...byPlace.entries()];

  for (let i = 0; i < places.length; i++) {
    if (now().getTime() - started > options.budgetMs) {
      summary.remaining = places.length - i;
      break;
    }
    const [placeId, owners] = places[i];
    let detail: PlaceDetail;
    try {
      detail = await deps.getDetail(placeId);
      summary.fetched++;
    } catch (err) {
      // 1 店舗が消えていても他は続ける。キー・上限のエラーは全体を止める
      if (err instanceof PlacesError && (err.code === "not_found" || err.code === "invalid")) {
        summary.failed++;
        continue;
      }
      summary.aborted = err instanceof Error ? err.message : "更新中にエラーが発生しました";
      summary.remaining = places.length - i;
      break;
    }
    const at = now();
    const shared = buildMeoReport(detail, at);
    const userIds = [...new Set(owners.map((o) => o.user_id))];
    for (const userId of userIds) {
      try {
        // 自社として登録している利用者にはオーナー申告を足して採点する（競合としてだけなら共通の報告書）
        const isOwn = owners.some((o) => o.user_id === userId && o.own_place_id === "");
        const ownerData = isOwn && deps.getOwnerInput ? await deps.getOwnerInput(userId, placeId) : null;
        const report = ownerData ? buildMeoReport(detail, at, ownerData) : shared;
        await deps.save(userId, report);
        summary.saved++;
      } catch (err) {
        console.error("[maps-refresh] 保存に失敗", { placeId, userId, err });
        summary.failed++;
      }
    }
    try {
      await deps.markRefreshed(placeId, at);
    } catch (err) {
      console.error("[maps-refresh] 更新日時の記録に失敗", { placeId, err });
    }
  }
  return summary;
}
