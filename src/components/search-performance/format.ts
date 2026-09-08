/** 検索パフォーマンス画面の表示整形（純関数。テストで固定する） */

export function formatInt(n: number): string {
  return Math.round(n).toLocaleString("ja-JP");
}

/** CTR は 0〜1 で来る。パーセント表示にする */
export function formatCtr(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

/** 平均掲載順位。小数第 1 位まで */
export function formatPosition(p: number): string {
  return p > 0 ? p.toFixed(1) : "—";
}

/** 前期比の差分。0 除算とゼロ同士を避ける */
export function delta(current: number, previous: number): number {
  return current - previous;
}

/** 前期比の変化率（%）。前期が 0 なら null（「—」と出す） */
export function changeRate(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

/** URL を短く見せる（ホストを外し、長ければ末尾を省く） */
export function shortenUrl(url: string, max = 60): string {
  let path = url;
  try {
    const u = new URL(url);
    path = `${u.pathname}${u.search}` || "/";
  } catch {
    // URL として読めないものはそのまま
  }
  return path.length > max ? `${path.slice(0, max - 1)}…` : path;
}
