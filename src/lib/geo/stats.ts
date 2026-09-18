/**
 * 統計と表示のまるめ（仕様書 §5）。純関数。
 *
 * この製品でいちばん壊れやすいのは「言えないことを言ってしまう」こと。
 * n=3 の週次比較は完全分離でも Fisher 両側 p=0.10 で、単独では何も言えない（§5.2）。
 * そのため **見出しは 4 週ローリング**、**信頼区間はバンド表示**、
 * **通常プロンプトの単体は段階表示**、**「有意差」という言葉は使わない**。
 */

/** Wilson の 95% 信頼区間の z 値 */
const Z_95 = 1.959963984540054;

export interface Interval {
  low: number;
  high: number;
}

/**
 * Wilson score interval。正規近似（Wald）と違って n が小さくても
 * 0% / 100% で幅が潰れない。折れ線のバンドはこれを使う（§5.1-2）。
 */
export function wilsonInterval(successes: number, total: number, z = Z_95): Interval {
  if (total <= 0) return { low: 0, high: 1 };
  const p = successes / total;
  const z2 = z * z;
  const denominator = 1 + z2 / total;
  const center = p + z2 / (2 * total);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total);
  return {
    low: clamp01((center - margin) / denominator),
    high: clamp01((center + margin) / denominator),
  };
}

/**
 * 0〜1 に収め、浮動小数の残りかす（2.1e-17 のような値）を落とす。
 * この値は保存も表示もするので、境界はちょうど 0 / 1 にしておく。
 */
function clamp01(v: number): number {
  const clamped = Math.min(1, Math.max(0, v));
  return Math.round(clamped * 1e6) / 1e6;
}

/** 段階表示の区分（§5.1-3。通常プロンプトの単体表示） */
export type Band = "often" | "sometimes" | "rare" | "none";

export const BAND_LABELS: Record<Band, string> = {
  often: "よく言及される",
  sometimes: "たまに言及される",
  rare: "ほとんど無い",
  none: "言及なし",
};

/**
 * 比率を 4 段階にまるめる。n が小さいときにパーセントを見せないための関数。
 * 境界は 2/3・1/3・0（n=12 なら 8 回・4 回・0 回）。
 */
export function toBand(successes: number, total: number): Band {
  if (total <= 0 || successes <= 0) return "none";
  const p = successes / total;
  if (p >= 2 / 3) return "often";
  if (p >= 1 / 3) return "sometimes";
  return "rare";
}

/**
 * パーセント表示を許してよいか（§5.1-4）。
 * 高精度プロンプト（4 週ローリングで n≈40、CI ±15pt 程度）以上でのみ許可。
 */
export const PERCENT_DISPLAY_MIN_N = 30;

export function allowsPercent(n: number): boolean {
  return n >= PERCENT_DISPLAY_MIN_N;
}

/**
 * 変化の大きさの表現（§5.1-5）。**「有意差あり」とは書かない。**
 * 2 つの区間が重なっていなければ「大きな変化」、重なっていれば「差は読み取れない」。
 */
export type ChangeVerdict = "large-up" | "large-down" | "unclear";

export const CHANGE_LABELS: Record<ChangeVerdict, string> = {
  "large-up": "大きな変化を検出（増加）",
  "large-down": "大きな変化を検出（減少）",
  unclear: "この観測数では差は読み取れません",
};

export function compareRates(
  before: { successes: number; total: number },
  after: { successes: number; total: number },
): ChangeVerdict {
  if (before.total <= 0 || after.total <= 0) return "unclear";
  const a = wilsonInterval(before.successes, before.total);
  const b = wilsonInterval(after.successes, after.total);
  if (b.low > a.high) return "large-up";
  if (b.high < a.low) return "large-down";
  return "unclear";
}

/** 表示用のパーセント（小数なし） */

/** 「±N pt」の表示。バンドの広さを一言で伝える */
export function marginLabel(interval: Interval, point: number): string {
  const margin = Math.max(Math.abs(interval.high - point), Math.abs(point - interval.low));
  return `±${Math.round(margin * 100)}pt`;
}
