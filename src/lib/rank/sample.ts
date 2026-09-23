/**
 * 順位の推移グラフの「計測前のイメージ」（純関数・テスト対象）。
 *
 * 利用者の指示 2026-09-22:「順位計測はグラフにしてください。最初のうちはデータがないので、
 * デモデータの破線グラフで表示させてください」。
 *
 * 空の画面を出すと、お客様は**何が出るようになるのか分からないまま離れる**。
 * AI 検索モニタリング（r149）で同じ判断をしているので、見せ方もそろえる。
 *
 * 守ること:
 * - **日付はこれから測る日（未来）を使う。**過去の日付で描くと「もう測った数字」に見える
 * - 線は破線（`dashed`）。実線 = 実測、破線 = 実測ではない、の区別を崩さない
 * - 登録済みのキーワードがあれば、その言葉で描く（自分の語だと「これが自分の画面になる」と伝わる）
 */
import { comingWeekdays } from "@/lib/demo/dates";
import { SAMPLE_POINTS, SAMPLE_SERIES_MAX } from "@/lib/demo/sample";

/** 点の数・線の本数の上限は見本の共通の値（src/lib/demo/sample.ts） */
export { SAMPLE_POINTS, SAMPLE_SERIES_MAX };

/** キーワードの登録がまだ無いときに使う、例としての言葉 */
export const SAMPLE_FALLBACK_LABELS = ["例: 地域名 + 業種", "例: サービス名 + 料金", "例: 〇〇 おすすめ"] as const;

/**
 * 自動計測が走る曜日（火曜）。`src/lib/jobs/schedule.ts` の定期処理（rank-weekly）と同じ。
 * 見本の横軸は「これから数字が入る日」なので、この曜日に合わせる。
 */
const MEASURE_WEEKDAY = 2; // 0 = 日曜

/**
 * これから計測する日（火曜）を古い順に返す（日本時間）。
 * 火曜の 5:00 の自動計測より前なら今日から、過ぎていれば次の火曜から数える。
 *
 * 以前はローカル時刻で数えていたため、UTC で動くサーバーの描画と日本のブラウザの描画で
 * 0〜9 時の間だけ日付が食い違っていた（hydration のずれ）。共通の `comingWeekdays` に寄せた（2026-09-23）。
 */
export function comingMeasureDates(count = SAMPLE_POINTS, now = new Date()): string[] {
  return comingWeekdays(count, MEASURE_WEEKDAY, now);
}

/**
 * 見本の形。3 本で「上がっていく / 横ばい / 圏外から入ってくる」を見せる。
 * `null` は圏外（100 位より下）で、グラフでは線が切れる。
 * 点の数が 4 でなくても、足りない分は最後の値を伸ばす。
 */
const SAMPLE_SHAPES: readonly (readonly (number | null)[])[] = [
  [28, 21, 15, 9],
  [7, 9, 8, 6],
  [null, null, 44, 31],
];

export interface SampleRankSeries {
  id: string;
  label: string;
  /** 順位（1 が上）。null は圏外 */
  values: (number | null)[];
}

/**
 * 見本の系列を作る。`labels` に登録済みのキーワードを渡すと、その言葉で描く。
 * 実測ではないことが値からも分かるよう、id は `sample-` で始める。
 */
export function sampleRankSeries(labels: readonly string[], points = SAMPLE_POINTS): SampleRankSeries[] {
  const names = (labels.length > 0 ? labels : SAMPLE_FALLBACK_LABELS).slice(0, SAMPLE_SERIES_MAX);
  return names.map((label, i) => {
    const shape = SAMPLE_SHAPES[i % SAMPLE_SHAPES.length]!;
    const values = Array.from({ length: points }, (_, p) => shape[Math.min(p, shape.length - 1)] ?? null);
    return { id: `sample-${i}`, label, values };
  });
}

/** 見本のグラフの縦軸の下限（＝図の下端の順位）。実測が入るまでの固定値 */
export function sampleYMax(series: readonly SampleRankSeries[]): number {
  const ranks = series.flatMap((s) => s.values).filter((v): v is number => v !== null);
  return Math.max(10, ...ranks);
}
