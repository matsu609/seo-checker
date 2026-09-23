/**
 * 定期処理で「前回たどり着けなかった人から始める」ための並べ替え（純関数。2026-09-23）。
 *
 * 1 回の Cron で回せる人数には上限がある（時間切れ）。以前は毎回同じ順番
 * （更新が新しい順・登録が古い順）で回していたため、**後ろのほうの人は毎回切られて
 * 一度も処理されない**ことがあった。表を増やさずに直すため、前回の実行記録（cron_runs の
 * summary）に「次に始める人」を残し、次回はその人から回す（一周したら先頭に戻る）。
 */

/** 実行記録に残す「次に始める人」のキー */
export const RESUME_KEY = "nextStart";

/**
 * ID の順に並べ、`cursor` 以上の最初の人から始まるように回す。
 * cursor の人がいなくなっていても、その次の人から始まる。cursor が無ければ先頭から。
 */
export function startFromCursor<T>(items: readonly T[], idOf: (item: T) => string, cursor: string | null): T[] {
  const sorted = [...items].sort((a, b) => (idOf(a) < idOf(b) ? -1 : idOf(a) > idOf(b) ? 1 : 0));
  if (!cursor) return sorted;
  const index = sorted.findIndex((item) => idOf(item) >= cursor);
  if (index <= 0) return sorted;
  return [...sorted.slice(index), ...sorted.slice(0, index)];
}

/**
 * 前回の実行記録から cursor を読む。**時間切れ（aborted）で終わったときだけ**続きがある。
 * 最後まで回れた（ok）ときは先頭から始めればよいので null。
 */
export function cursorFromRun(run: { status: string; summary: Record<string, unknown> } | null): string | null {
  if (!run || run.status !== "aborted") return null;
  const value = run.summary[RESUME_KEY];
  return typeof value === "string" && value ? value : null;
}
