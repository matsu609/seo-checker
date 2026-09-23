/** Google サーチコンソール連携の表示整形（純関数。テストで固定する） */

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

/** 日付の目盛り（"2026-09-01" → "9/1"） */
export function dayLabel(iso: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${Number(m[1])}/${Number(m[2])}` : iso;
}

/**
 * 連携前に見せる「イメージ」の日別クリック数（28 日分）。実測ではない。
 * 平日に多く週末に少ない、ゆるい右肩上がりの形にしてある（乱数は使わない。描くたびに形が変わらないように）。
 */
export function sampleDailyClicks(days = 28): number[] {
  return Array.from({ length: days }, (_, i) => {
    const weekday = i % 7;
    const base = 18 + i * 0.5;
    return Math.round(weekday >= 5 ? base * 0.6 : base + (weekday % 3));
  });
}
