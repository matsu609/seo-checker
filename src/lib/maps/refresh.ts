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
import { nextWeekdayAtJst } from "@/lib/time/jst";
import { PlacesError, type PlacesErrorCode } from "./client";
import type { MeoOwnerData } from "./owner-input";
import { buildMeoReport, type MeoReport } from "./report";
import type { MeoStoreRow } from "./stores";
import type { PlaceDetail } from "./types";

/** 更新曜日（0 = 日曜 … 1 = 月曜）と時刻（日本時間） */
export const REFRESH_WEEKDAY = 1;
export const REFRESH_HOUR_JST = 5;

/** 次の一斉更新の日時（UTC の Date）。ちょうど更新時刻なら 1 週間後 */
export function nextRefreshAt(now = new Date()): Date {
  // 2026-09-23: 手書きの JST 計算を time/jst.ts に寄せた（「ちょうどなら翌週」も同じ決まり）
  return nextWeekdayAtJst(now, REFRESH_WEEKDAY, REFRESH_HOUR_JST);
}

/** 直前の一斉更新の日時（表示用。「この数字は○日時点」） */
export function lastRefreshAt(now = new Date()): Date {
  const next = nextRefreshAt(now);
  return new Date(next.getTime() - 7 * 24 * 60 * 60 * 1000);
}

/**
 * 全体を止めるエラー（キーが無い・拒否された・上限）。次の店舗でも必ず同じ結果になるので、
 * 続けても Google の上限を削るだけ。
 */
const FATAL_CODES: readonly PlacesErrorCode[] = ["not_configured", "denied", "rate_limited"];

/**
 * 一時的な失敗（タイムアウト・Google の 5xx・通信断）がこの回数続いたら、Google 側の障害とみて止める。
 * 1 店舗あたり最大 15 秒待つので、障害中に全店舗を回ると時間を使い切ってしまう。
 */
export const MAX_CONSECUTIVE_TRANSIENT = 5;

/** 取得の失敗の分類（純粋関数）。fatal = 全体を止める / skip = その店舗だけ飛ばす / transient = 一時的 */
export function classifyRefreshError(err: unknown): "fatal" | "skip" | "transient" {
  if (err instanceof PlacesError) {
    if (FATAL_CODES.includes(err.code)) return "fatal";
    // 店舗が消えた・ID が通らない（その店舗だけの問題）
    if (err.code === "not_found" || err.code === "invalid") return "skip";
    return "transient";
  }
  // AbortSignal.timeout の TimeoutError（PlacesError ではない）・fetch の TypeError など
  return "transient";
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
  /** 自社店舗の報告書に検索順位・周辺の同業を付ける（r29）。省略時は付けない。失敗しても保存は止めない */
  enrich?: (userId: string, detail: PlaceDetail, owner: MeoOwnerData | null) => Promise<Pick<MeoReport, "rank" | "area">>;
  /**
   * その利用者のプランでマップ診断が使えるか。省略時は全員を対象にする。
   * 使えない利用者の行は飛ばし、使える利用者が 1 人もいない店舗は Google に問い合わせない。
   */
  allowsUser?: (userId: string) => Promise<boolean>;
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
  /** 登録している利用者が全員プランの対象外で、問い合わせなかった店舗数 */
  skippedPlan: number;
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

  const summary: RefreshSummary = { rows: rows.length, fetched: 0, saved: 0, failed: 0, remaining: 0, skippedPlan: 0, aborted: null };
  const places = [...byPlace.entries()];
  // プランの判定は利用者ごとに 1 回（同じ利用者が何店舗も登録していても Clerk に何度も聞かない）
  const allowed = new Map<string, Promise<boolean>>();
  const allows = (userId: string): Promise<boolean> => {
    if (!deps.allowsUser) return Promise.resolve(true);
    let p = allowed.get(userId);
    if (!p) {
      p = deps.allowsUser(userId).catch(() => false);
      allowed.set(userId, p);
    }
    return p;
  };
  let transientStreak = 0;

  for (let i = 0; i < places.length; i++) {
    if (now().getTime() - started > options.budgetMs) {
      summary.remaining = places.length - i;
      break;
    }
    const [placeId, allOwners] = places[i];
    // 解約・プラン変更した利用者の店舗まで毎週 Google に問い合わせない（2026-09-23。ほかの定期処理と同じ判定）
    const owners: MeoStoreRow[] = [];
    for (const o of allOwners) if (await allows(o.user_id)) owners.push(o);
    if (owners.length === 0) {
      summary.skippedPlan++;
      // 更新日時は進める。進めないと、対象外の店舗がいつまでも「更新が古い順」の先頭に居座り、
      // 1 回で読む行数の枠を使い切って、ほかの利用者の店舗が回らなくなる
      try {
        await deps.markRefreshed(placeId, now());
      } catch (err) {
        console.error("[maps-refresh] 更新日時の記録に失敗", { placeId, err });
      }
      continue;
    }
    let detail: PlaceDetail;
    try {
      detail = await deps.getDetail(placeId);
      summary.fetched++;
      transientStreak = 0;
    } catch (err) {
      // 2026-09-23: 以前は not_found / invalid 以外をすべて「全体を止める」扱いにしていたため、
      // 1 店舗のタイムアウト（TimeoutError）や Google の 5xx で残りの全店舗が止まっていた。
      // 止めるのはキー・上限のエラーと、一時的な失敗が続いたとき（Google 側の障害）だけ
      const kind = classifyRefreshError(err);
      if (kind !== "fatal") {
        summary.failed++;
        if (kind === "skip") {
          transientStreak = 0;
          continue;
        }
        transientStreak++;
        console.error("[maps-refresh] 店舗の取得に失敗（次の店舗へ進む）", { placeId, err });
        if (transientStreak < MAX_CONSECUTIVE_TRANSIENT) continue;
        summary.aborted = `Google マップの API が ${MAX_CONSECUTIVE_TRANSIENT} 回続けて応答しなかったため、残りは次回に回します`;
        summary.remaining = places.length - i - 1;
        break;
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
        let report = ownerData ? buildMeoReport(detail, at, ownerData) : shared;
        if (isOwn && deps.enrich) {
          try {
            report = { ...report, ...(await deps.enrich(userId, detail, ownerData)) };
          } catch (err) {
            console.error("[maps-refresh] 順位・周辺の取得に失敗（報告書は保存する）", { placeId, userId, err });
          }
        }
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
