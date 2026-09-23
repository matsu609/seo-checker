/**
 * どのジョブをいつ動かすか（純粋関数。テストで固定する）。
 *
 * 1 日 1 回（5:00 JST）の Cron の中で、その日に動くものだけを順に実行する。
 * 重い処理（外部 API の実費が出るもの）は曜日で分散し、1 日に 1 本にする:
 *   月: マップ診断の一斉更新（Places）      … 従来どおり
 *   火: 順位計測（SerpApi）
 *   水: サイトの事故監視（自社サイトへのアクセスだけ）
 *   毎月 1 日: 月次レポート（保存済みの数字から。外部 API は叩かない）
 *   毎月 2 日: 掲載の再チェック（掲載ページへのアクセスだけ）
 *   毎日: 予約した投稿の送信（軽い）、精密診断の自動再診断（期限が来た人を、残り時間の範囲で）
 *
 * 月次のジョブ（2026-09-23 に直した）:
 *   以前は曜日のジョブの**後ろ**にあり、1 日・2 日が月〜水に当たると、前の重いジョブが
 *   残り時間を 10〜30 秒まで使い切るため最低限の時間（60 秒）が残らず、**その月は丸ごと
 *   飛ばされていた**（次は 2026-12-01 火曜）。月次のジョブは軽い（保存済みの数字を読む・
 *   数ページを開く）ので、曜日の重いジョブより**前**に置き、使ってよい時間に上限を付ける。
 *   さらに予定日から 2 日のあいだは「今月まだ最後まで終わっていなければ」動かす（取り返し）。
 */
import { addDays, jstDate, jstParts, nextMonthDayAtJst, nextWeekdayAtJst, type JstParts } from "@/lib/time/jst";
import type { JobId } from "./types";

export const CRON_HOUR_JST = 5;

/** 月次のジョブを取り返してよい日数（予定日の翌日から数えて） */
export const MONTHLY_GRACE_DAYS = 2;

export interface JobSchedule {
  id: JobId;
  label: string;
  /** 画面に出す 1 行 */
  description: string;
  /** 「毎週火曜」など */
  cadence: string;
  /** その日に動かすか（月次のジョブは取り返しの日も真になる。済んだかは runner が実行記録で確かめる） */
  due(parts: JstParts): boolean;
  /** 次回の予定日時 */
  next(now: Date): Date;
  /** 動かし始めるのに最低限ほしい残り時間（ms）。足りなければ今日は飛ばす */
  minBudgetMs: number;
  /** 使ってよい時間の上限（ms）。後ろのジョブの時間を食い尽くさないように。省略時は残り全部 */
  maxBudgetMs?: number;
  /**
   * 取り返しのあるジョブ（月次）。この時刻以降に最後まで終わった（ok）記録があれば、今回は動かさない
   * （同じ月に 2 回動かさない。飛ばされた・時間切れの月は翌日以降に続きをやる）
   */
  catchUpSince?(now: Date): Date;
}

const weekly = (weekday: number) => ({
  due: (p: JstParts) => p.weekday === weekday,
  next: (now: Date) => nextWeekdayAtJst(now, weekday, CRON_HOUR_JST),
});
const monthly = (day: number) => ({
  // 予定日から MONTHLY_GRACE_DAYS 日のあいだは動かしてよい（済んでいれば runner が飛ばす）
  due: (p: JstParts) => p.day >= day && p.day <= day + MONTHLY_GRACE_DAYS,
  next: (now: Date) => nextMonthDayAtJst(now, day, CRON_HOUR_JST),
  // 今月の予定日の 0:00（日本時間）
  catchUpSince: (now: Date) => {
    const p = jstParts(now);
    return jstDate(p.year, p.month, day);
  },
});
const daily = () => ({
  due: () => true,
  // きょうの 5:00 がまだなら きょう、過ぎていれば あす（曜日の関数を使うと 1 週間後になってしまう。2026-09-20 に本番で判明）
  next: (now: Date) => {
    const p = jstParts(now);
    const today = jstDate(p.year, p.month, p.day, CRON_HOUR_JST);
    return now.getTime() < today.getTime() ? today : addDays(today, 1);
  },
});

/**
 * 実行順に並べる（軽いものを先に。時間切れで飛ぶのは後ろのもの）。
 * 月次のジョブは曜日の重いジョブより前（上の説明）。上限を付けて後ろの時間を残す
 */
export const JOB_SCHEDULE: readonly JobSchedule[] = [
  { id: "gbp-posts", label: "投稿の送信", description: "予約した Google ビジネス プロフィールの投稿を、予定時刻を過ぎた分だけ送る", cadence: "毎日", ...daily(), minBudgetMs: 20_000 },
  { id: "monthly-report", label: "月次レポート", description: "前月の数字（順位・MEO・AI 検索・精密診断・掲載・口コミ）をまとめてメールする", cadence: "毎月 1 日", ...monthly(1), minBudgetMs: 60_000, maxBudgetMs: 90_000 },
  { id: "listings-recheck", label: "掲載の再チェック", description: "掲載済みの媒体のページを開き、店名・電話・住所が今も正しく出ているかを確かめる", cadence: "毎月 2 日", ...monthly(2), minBudgetMs: 60_000, maxBudgetMs: 90_000 },
  { id: "maps-refresh", label: "マップ診断の一斉更新", description: "登録した全店舗の Google マップの情報を取り直して報告書を保存する", cadence: "毎週月曜", ...weekly(1), minBudgetMs: 60_000 },
  { id: "rank-weekly", label: "順位計測（自動）", description: "登録キーワードの検索順位と AI Overviews を測って保存し、急落を知らせる", cadence: "毎週火曜", ...weekly(2), minBudgetMs: 60_000 },
  { id: "site-monitor", label: "サイトの事故監視", description: "ホームページの主要ページを確認し、noindex・エラー・SSL 期限などの事故を知らせる", cadence: "毎週水曜", ...weekly(3), minBudgetMs: 60_000 },
  { id: "seo-reanalysis", label: "精密診断の自動再診断", description: "前回の診断から 30 日たったサイトを同じ条件で診断し直し、直った・悪化した点を出す", cadence: "毎日（期限が来た人だけ）", ...daily(), minBudgetMs: 150_000 },
];

export function scheduleOf(id: JobId): JobSchedule {
  const s = JOB_SCHEDULE.find((x) => x.id === id);
  if (!s) throw new Error(`知らないジョブです: ${id}`);
  return s;
}

/** その日に動くジョブ（実行順） */
export function dueJobs(now: Date): JobId[] {
  const parts = jstParts(now);
  return JOB_SCHEDULE.filter((s) => s.due(parts)).map((s) => s.id);
}
