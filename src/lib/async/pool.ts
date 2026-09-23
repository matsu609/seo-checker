/**
 * 同時実行数を絞って順に処理する（純粋な非同期ユーティリティ）。
 *
 * 以前は順位計測（src/lib/rank/measure.ts）の中にあり、サイト監視がそこから借りていた。
 * 機能に属さない道具なので、ここに置く（2026-09-23）。
 */

/**
 * 1 件の失敗で全体を落とさず、呼び出し側が「行ごとのエラー」を返せるように結果は入力順で戻す
 * （worker の中で例外を返り値に変えるのは呼び出し側の責任）。
 */
export async function runPool<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const size = Math.max(1, Math.min(limit, items.length || 1));
  const out = new Array<R>(items.length);
  let cursor = 0;
  async function next(): Promise<void> {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      out[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: size }, () => next()));
  return out;
}
