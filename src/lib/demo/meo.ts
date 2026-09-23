/**
 * MEO（Google マップ・口コミ・投稿）の「計測前のイメージ」のデータ（純関数・テスト対象）。
 *
 * 利用者の指示 2026-09-22:「すべての計測データはグラフにしてください。デモデータを入れて、
 * 最初からグラフがこう表示される・データがこう集計されると直感的に分かるように。
 * MEO は抜け漏れがないようにタブごとに実装していってください」。
 *
 * 画面（コンポーネント）は「どう描くか」だけを持ち、**見本の中身はここに 1 か所で置く**。
 * こうしておくと、MEO の 4 タブ（Google マップ / 口コミを集める / 口コミに返す / 投稿）で
 * 見本の形と言い回しがそろい、直し忘れが起きない。
 *
 * 守ること:
 * - 横軸は**これからの日付**（`./dates`）。過去で描くと「もう測った数字」に見える
 * - 線は必ず破線（`dashed`）で描く。**実線 = 実測、破線 = 実測ではない**を崩さない
 * - 値は「ありえる範囲」にとどめる。話がうますぎる見本は、実測が入ったときに落胆させる
 * - 登録済みの名前（キーワード・店舗名）があれば見本にもそれを使う。自分の言葉だと
 *   「これが自分の画面になる」と伝わる
 */
import { CATEGORY_LABELS, CATEGORY_ORDER } from "@/lib/maps/score";
import { comingMonths, comingWeekdays } from "./dates";
import { SAMPLE_POINTS, SAMPLE_SERIES_MAX } from "./sample";

/** 一斉更新の曜日（月曜 5:00）。見本の横軸はこの曜日に合わせる */
export const REFRESH_WEEKDAY = 1;

/** 点の数・線の本数の上限は見本の共通の値（./sample） */
export { SAMPLE_POINTS, SAMPLE_SERIES_MAX };

export interface DemoSeries {
  id: string;
  label: string;
  /** 欠測は null（グラフで線が切れる） */
  values: (number | null)[];
}

/** 点の数に合わせて形を伸ばす（足りない分は最後の値を繰り返す） */
function stretch(shape: readonly (number | null)[], points: number): (number | null)[] {
  return Array.from({ length: points }, (_, i) => shape[Math.min(i, shape.length - 1)] ?? null);
}

/* ───────────── ① Google マップ: 診断スコアの推移 ───────────── */

/**
 * 総合 + 4 カテゴリ（基本情報 / 投稿 / 写真 / レビュー）の形。
 * 「投稿と写真を足していくと総合が上がる」という、このツールで実際に起きる動き方にしてある。
 */
const SCORE_SHAPES: Record<string, readonly number[]> = {
  overall: [52, 58, 66, 74],
  basics: [70, 76, 82, 88],
  posts: [20, 35, 50, 65],
  photos: [45, 52, 60, 72],
  reviews: [60, 62, 66, 70],
};

/**
 * 診断スコアの推移の見本。線は総合 + 4 カテゴリの 5 本
 * （LineChart は 6 色・6 種類の点を持つので 5 本まで読める）。
 */
export function sampleScoreTrend(points = SAMPLE_POINTS, now = new Date()): { dates: string[]; series: DemoSeries[] } {
  const dates = comingWeekdays(points, REFRESH_WEEKDAY, now);
  const series: DemoSeries[] = [
    { id: "sample-overall", label: "総合", values: stretch(SCORE_SHAPES.overall!, points) },
    ...CATEGORY_ORDER.map((id) => ({
      id: `sample-${id}`,
      label: CATEGORY_LABELS[id],
      values: stretch(SCORE_SHAPES[id]!, points),
    })),
  ];
  return { dates, series };
}

/* ───────────── ② Google マップ: マップ検索順位の推移 ───────────── */

/** キーワードの登録がまだ無いときに使う、例としての言葉 */
export const SAMPLE_MAP_KEYWORDS = ["例: 地域名 + 業種", "例: 地域名 + メニュー", "例: 〇〇 近く"] as const;

/**
 * マップ検索の順位の形。マップの一覧は上位 20 件までしか見ないので、
 * 圏外（null）からの浮上を 1 本入れておく。
 */
const MAP_RANK_SHAPES: readonly (readonly (number | null)[])[] = [
  [12, 9, 7, 5],
  [4, 5, 4, 3],
  [null, 18, 14, 11],
];

export function sampleMapRankTrend(
  keywords: readonly string[],
  points = SAMPLE_POINTS,
  now = new Date(),
): { dates: string[]; series: DemoSeries[] } {
  const names = (keywords.length > 0 ? keywords : SAMPLE_MAP_KEYWORDS).slice(0, SAMPLE_SERIES_MAX);
  return {
    dates: comingWeekdays(points, REFRESH_WEEKDAY, now),
    series: names.map((label, i) => ({
      id: `sample-${i}`,
      label,
      values: stretch(MAP_RANK_SHAPES[i % MAP_RANK_SHAPES.length]!, points),
    })),
  };
}

/* ───────────── ③ Google マップ: 見られ方（月次インサイト） ───────────── */

/**
 * 月ごとの形。表示回数は 3 桁〜4 桁、行動（電話・サイト・ルート）はその 1〜5% という、
 * 小さな店舗で実際に起きる比率にしてある。
 */
const INSIGHT_SHAPES: readonly { id: string; label: string; shape: readonly number[] }[] = [
  { id: "impressions", label: "表示回数（合計）", shape: [820, 910, 1040, 1180, 1260, 1390] },
  { id: "calls", label: "電話クリック数", shape: [12, 15, 18, 21, 23, 27] },
  { id: "websiteClicks", label: "ウェブサイトクリック数", shape: [26, 31, 38, 44, 47, 55] },
  { id: "directions", label: "ルート検索回数", shape: [34, 39, 46, 52, 58, 64] },
];

/** 見られ方（月次）の見本。表示回数は桁が違うので、呼ぶ側で分けて描く */
export function sampleInsightTrend(months = 6, now = new Date()): { months: string[]; series: DemoSeries[] } {
  return {
    months: comingMonths(months, now),
    series: INSIGHT_SHAPES.map((s) => ({ id: `sample-${s.id}`, label: s.label, values: stretch(s.shape, months) })),
  };
}

/* ───────────── ④ Google マップ: 競合との比較 ───────────── */

export interface DemoCompareRow {
  label: string;
  /** 充実度（0〜100） */
  score: number;
  own: boolean;
}

/** 競合をまだ登録していないときの、比較の見本（自社は真ん中あたりに置く） */
export function sampleCompare(ownName: string | null): DemoCompareRow[] {
  return [
    { label: "例: 競合 A", score: 81, own: false },
    { label: ownName ? `${ownName}（自社）` : "例: 自社", score: 66, own: true },
    { label: "例: 競合 B", score: 58, own: false },
    { label: "例: 競合 C", score: 44, own: false },
  ];
}

/* ───────────── ⑤ 口コミ: アンケート（集める）の集計 ───────────── */

export interface DemoSurveyWeeks {
  weeks: string[];
  /** 回答数 */
  answers: number[];
  /** Google の投稿ボタンを押した数 */
  clicks: number[];
}

/** 週ごとの回答数と投稿ボタンの押下数（押下率はおよそ 4〜5 割） */
export function sampleSurveyWeeks(weeks = SAMPLE_POINTS, now = new Date()): DemoSurveyWeeks {
  const answers = stretch([6, 11, 9, 14], weeks) as number[];
  const clicks = stretch([2, 5, 4, 7], weeks) as number[];
  return { weeks: comingWeekdays(weeks, REFRESH_WEEKDAY, now), answers, clicks };
}

/** 評価の分布の見本（1〜5 の件数）。低評価がゼロの見本にしない（低評価対応がこの機能の要） */
export const SAMPLE_RATING_DISTRIBUTION: readonly [number, number, number, number, number] = [1, 2, 4, 11, 22];

/* ───────────── ⑥ 口コミ: 返信の状況 ───────────── */

export interface DemoReplyMix {
  /** 返信済みの件数 */
  replied: number;
  /** 未返信の件数 */
  pending: number;
  /** 評価ごとの件数（1〜5） */
  distribution: readonly [number, number, number, number, number];
}

/** Google マップの口コミと返信の見本。未返信が残っている状態にする（それが直す対象だから） */
export const SAMPLE_REPLY_MIX: DemoReplyMix = {
  replied: 18,
  pending: 7,
  distribution: [1, 1, 3, 8, 12],
};

/* ───────────── ⑦ 投稿: 週ごとの投稿数 ───────────── */

/** MEO の理想（週 1 回）。見本の目安線にも使う */
export const IDEAL_POSTS_PER_WEEK = 1;

/** 週ごとの投稿数の見本（週 1 回を続けた形） */
export function samplePostWeeks(weeks = SAMPLE_POINTS, now = new Date()): { weeks: string[]; published: number[] } {
  return { weeks: comingWeekdays(weeks, REFRESH_WEEKDAY, now), published: stretch([1, 1, 2, 1], weeks) as number[] };
}
