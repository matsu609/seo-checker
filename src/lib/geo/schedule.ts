/**
 * 反復の日次分散と、顧客間の実行日分散（仕様書 §2.2〜§2.4）。純関数。
 *
 * **同じ週の反復を同じバッチで連続実行しない。**連続実行はデコーディングの
 * ランダム性しか捉えないため、モデル更新・インデックス更新・時間帯差を
 * 捉えるには日をまたいで散らす必要がある（§2.3）。
 *
 *   通常プロンプト  n=3  … 月・水・金に 1 回ずつ
 *   高精度プロンプト n=10 … 月〜金に 2 回ずつ
 *
 * さらに契約ごとの `runDayOffset`（0〜6）で曜日をずらし、全顧客が同じ曜日に
 * 集中しないようにする（§2.4。原価は変わらないが、ブロック率とインフラの山を下げる）。
 */

/** 通常プロンプトの週あたり反復回数（§2.2） */
export const NORMAL_REPEATS_PER_WEEK = 3;
/** 高精度プロンプトの週あたり反復回数（§2.2） */
export const PRECISION_REPEATS_PER_WEEK = 10;

/** 週内の実行計画。index 0 = 月曜 … 6 = 日曜。値はその日の実行回数 */
export type WeekPlan = readonly [number, number, number, number, number, number, number];

/** 通常: 月・水・金に 1 回ずつ（計 3） */
export const NORMAL_PLAN: WeekPlan = [1, 0, 1, 0, 1, 0, 0];
/** 高精度: 月〜金に 2 回ずつ（計 10） */
export const PRECISION_PLAN: WeekPlan = [2, 2, 2, 2, 2, 0, 0];

export function weekPlan(precisionMode: boolean): WeekPlan {
  return precisionMode ? PRECISION_PLAN : NORMAL_PLAN;
}

/** 順位・AIO は週 1 回。月曜に寄せる */
export const RANK_PLAN: WeekPlan = [1, 0, 0, 0, 0, 0, 0];

/**
 * 月曜を 0 とした曜日番号。`Date.getUTCDay()` は日曜が 0 なので合わせる。
 * 計測は JST で動かすので、UTC から +9 時間してから曜日を取る。
 */
export function jstWeekdayIndex(now: Date): number {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return (jst.getUTCDay() + 6) % 7;
}

/** JST の日付（YYYY-MM-DD） */
export function jstDate(now: Date): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * 今日そのプロンプトを何回実行するか。
 * `runDayOffset` の分だけ週の並びを回転させる（顧客ごとに曜日をずらす）。
 */
export function repeatsToday(plan: WeekPlan, runDayOffset: number, now: Date): number {
  const weekday = jstWeekdayIndex(now);
  const offset = ((runDayOffset % 7) + 7) % 7;
  // オフセット分だけ「自分にとっての月曜」を後ろにずらす
  const index = ((weekday - offset) % 7 + 7) % 7;
  return plan[index];
}

/** 週の合計回数（計画の検算に使う） */
export function weeklyTotal(plan: WeekPlan): number {
  return plan.reduce((a, b) => a + b, 0);
}

/**
 * アカウントごとの実行日オフセットを決める（§2.4）。
 * ユーザー ID から決まる（= 同じ人はいつも同じ曜日。移動して欠測にならない）。
 */
export function runDayOffsetFor(userId: string): number {
  let hash = 0;
  for (let i = 0; i < userId.length; i += 1) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  return hash % 7;
}

/**
 * 指名プロンプトを高精度枠にしようとしたときの警告（§2.2）。
 * 指名検索は回答がほぼ決定論的なので、高精度枠は非指名に温存する。
 */
export function precisionWarning(isBranded: boolean): string | null {
  return isBranded
    ? "指名プロンプト（ブランド名を含む）は回答がほぼ決まっているため、高精度枠に入れても得られる情報が増えません。高精度枠は一般語・比較系のプロンプトに使ってください。"
    : null;
}

/** 週の開始日（月曜）を JST で返す。集計のキーに使う */
export function weekStart(now: Date): string {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const weekday = (jst.getUTCDay() + 6) % 7;
  jst.setUTCDate(jst.getUTCDate() - weekday);
  return jst.toISOString().slice(0, 10);
}

/* ───────────── 定期実行の予定（画面のバナー。2026-09-22） ───────────── */

/** 定期実行の時刻（JST の 5:00。vercel.json の `0 20 * * *` = 20:00 UTC） */
export const CRON_HOUR_JST = 5;

/**
 * 次に定期実行が走る時刻。いまが 5:00 より前なら今日の 5:00、過ぎていれば明日の 5:00。
 *
 * **`cron_runs` は見ない。**あの表は `/api/cron/daily` のジョブ用で、
 * AI 検索モニタリングの `/api/cron/geo-run` は記録していないため
 * （記録を足すより、固定スケジュールから計算するほうが正確で壊れない）。
 */
export function nextCronRun(now = new Date()): Date {
  const jstNow = now.getTime() + 9 * 60 * 60 * 1000;
  const d = new Date(jstNow);
  const today = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), CRON_HOUR_JST, 0, 0);
  const next = jstNow < today ? today : today + 24 * 60 * 60 * 1000;
  return new Date(next - 9 * 60 * 60 * 1000);
}

/** 「あと N 時間」「N 分後」のような、ざっくりした言い回し */
export function relativeLabel(from: Date, to: Date): string {
  const minutes = Math.round(Math.abs(to.getTime() - from.getTime()) / 60000);
  if (minutes < 60) return `${Math.max(1, minutes)} 分`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} 時間`;
  return `${Math.round(hours / 24)} 日`;
}
