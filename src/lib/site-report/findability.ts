/**
 * ファインダビリティスコア（可視性指数）と CTR カーブ
 * （docs/reference/04_implementation-guide.md §18.2 / §8.2）。純関数。
 *
 *   findability = Σ(月間検索数 × CTR(順位)) / Σ 月間検索数 × 100
 *
 * 検索ボリュームで重み付けするので「重要なキーワードで上位にいるほど高い」。
 * 月間検索数が未登録のキーワードと、まだ一度も計測していない（rank が undefined）
 * キーワードは分子・分母のどちらからも外す（0 として扱うとスコアが黙って下がり、
 * 実態より悪く見えるため）。§18.2 のスコアは「その日の計測値」から出すものなので、
 * 未計測を圏外と同じ扱いにすると日次系列（series.ts）と数字が食い違う。
 * 除外した件数は呼び出し側が画面に出せるよう結果に含める。
 */
import { MAX_RANK } from "@/lib/rank/types";

export interface CtrBand {
  /** この順位から（含む） */
  from: number;
  /** この順位まで（含む）。圏外は null */
  to: number | null;
  /** クリック率（0〜1） */
  ctr: number;
  label: string;
}

/**
 * CTR カーブ（設定値）。順位ごとのクリック率で、圏外は 0。
 * 推定アクセス数（C1）と同じ値を使う。
 */
export const CTR_CURVE: readonly CtrBand[] = [
  { from: 1, to: 1, ctr: 0.28, label: "1位" },
  { from: 2, to: 2, ctr: 0.15, label: "2位" },
  { from: 3, to: 3, ctr: 0.11, label: "3位" },
  { from: 4, to: 4, ctr: 0.08, label: "4位" },
  { from: 5, to: 5, ctr: 0.07, label: "5位" },
  { from: 6, to: 6, ctr: 0.05, label: "6位" },
  { from: 7, to: 7, ctr: 0.04, label: "7位" },
  { from: 8, to: 8, ctr: 0.035, label: "8位" },
  { from: 9, to: 9, ctr: 0.03, label: "9位" },
  { from: 10, to: 10, ctr: 0.025, label: "10位" },
  { from: 11, to: 20, ctr: 0.01, label: "11〜20位" },
  { from: 21, to: MAX_RANK, ctr: 0.003, label: "21位以下" },
  { from: MAX_RANK + 1, to: null, ctr: 0, label: "圏外" },
] as const;

/** 圏外（順位なし）の CTR */
export const CTR_OUT_OF_RANGE = 0;

/**
 * 順位 → CTR。null（圏外）と 100 位より下は 0。小数の順位は切り捨てて帯を引く。
 * undefined（未計測）も 0 を返すが、スコアの計算では findabilityScore が先に除外する。
 */
export function ctrForRank(rank: number | null | undefined): number {
  if (rank === null || rank === undefined || !Number.isFinite(rank)) return CTR_OUT_OF_RANGE;
  const r = Math.floor(rank);
  if (r < 1 || r > MAX_RANK) return CTR_OUT_OF_RANGE;
  const band = CTR_CURVE.find((b) => r >= b.from && (b.to === null || r <= b.to));
  return band ? band.ctr : CTR_OUT_OF_RANGE;
}

export interface FindabilityInput {
  /** 順位。圏外は null（CTR 0）、未計測は undefined（計算から除外する） */
  rank: number | null | undefined;
  /** 月間検索数。未登録は null / undefined（計算から除外する） */
  volume: number | null | undefined;
}

export interface FindabilityResult {
  /** 0〜100。分母（月間検索数の合計）が 0 なら null＝計算できない */
  score: number | null;
  /** 計算に使ったキーワード数（月間検索数が分かっているもの） */
  counted: number;
  /** 月間検索数が未登録で除外したキーワード数 */
  excluded: number;
  /** まだ一度も計測していない（順位が undefined）ため除外したキーワード数 */
  unmeasured: number;
  /** 分母 Σ 月間検索数 */
  volume: number;
  /** 分子 Σ(月間検索数 × CTR) */
  weighted: number;
}

/** 月間検索数が「分かっている」か（0 は分かっている扱い。負・非数は未登録扱い） */
function knownVolume(volume: number | null | undefined): volume is number {
  return typeof volume === "number" && Number.isFinite(volume) && volume >= 0;
}

/**
 * ファインダビリティスコア。空配列・全件圏外・分母 0 はすべて安全に処理する
 * （全件圏外は分子 0 なのでスコア 0、月間検索数が 1 件も無ければ null）。
 */
export function findabilityScore(items: readonly FindabilityInput[]): FindabilityResult {
  let volume = 0;
  let weighted = 0;
  let counted = 0;
  let excluded = 0;
  let unmeasured = 0;
  for (const item of items) {
    // 未計測（undefined）は圏外（null）ではない。CTR 0 として分子に積むと、
    // キーワードを登録しただけでスコアが下がり、計測済みだけで作るグラフとも食い違う
    if (item.rank === undefined) {
      unmeasured += 1;
      continue;
    }
    if (!knownVolume(item.volume)) {
      excluded += 1;
      continue;
    }
    counted += 1;
    volume += item.volume;
    weighted += item.volume * ctrForRank(item.rank);
  }
  const score = volume > 0 ? (weighted / volume) * 100 : null;
  return { score, counted, excluded, unmeasured, volume, weighted };
}

/** スコアの表示（小数 1 桁）。計算できないときは「—」 */
export function formatFindability(score: number | null): string {
  if (score === null || !Number.isFinite(score)) return "—";
  return score.toFixed(1);
}
