/**
 * 改善項目の「対応の優先度」（緊急度）。純関数（生成 AI 不使用）。
 *
 * 改善点を並べるだけでは「急いで直すべきか、あとでいいのか」が分からない
 * （利用者の指摘 2026-10-02）。見込み効果（点数）と項目の性質から 3 段階に分ける。
 *
 * - now   … 今すぐ対応: 検索や AI 検索に「載らない・読まれない」原因になる項目。
 *           点数の大小にかかわらず最優先（BLOCKING の一覧に載っている項目 × 判定）
 * - soon  … 要改善: 直すと総合スコアが動く項目（見込み効果 LATER_BELOW_GAIN 点以上）
 * - later … 後回しで OK: 直しても総合スコアがほとんど動かない項目
 *           （見込み効果 LATER_BELOW_GAIN 点未満）。余力があるときに
 *
 * サイト診断（ページ横断）でも同じ規則を使う。見込み効果はページ数で平均されるので、
 * 一部のページだけの軽い問題は自然と「後回しで OK」に落ちる。
 * ただし BLOCKING の項目は 1 ページでも該当すれば「今すぐ対応」にする
 * （noindex が 1 ページに付いていれば、そのページは検索に出ない）。
 */
import type { StatusTone } from "@/lib/ui/palette";

export type Urgency = "now" | "soon" | "later";

/** 表示順（今すぐ → 要改善 → 放置 OK） */
export const URGENCY_ORDER: readonly Urgency[] = ["now", "soon", "later"];

export const URGENCY_LABELS: Record<Urgency, string> = {
  now: "今すぐ対応",
  soon: "要改善",
  later: "後回しで OK",
};

/** ピルの色（判定色を流用。今すぐ = 未対応の赤、要改善 = 黄、放置 OK = 参考の青） */
export const URGENCY_TONES: Record<Urgency, StatusTone> = {
  now: "fail",
  soon: "warn",
  later: "info",
};

/** 付録・注記に出す説明 */
export const URGENCY_NOTES: Record<Urgency, string> = {
  now: "検索や AI 検索に載らない・読まれない原因になる項目です。点数の大小にかかわらず最初に直してください",
  soon: "直すと総合スコアが上がる項目です。優先改善 TOP3 から順に進めてください",
  later: "直しても総合スコアがほとんど動かない項目です（見込み効果が 2 点未満）。余力があるときで構いません",
};

/** これより見込み効果（総合スコアの増分）が小さい項目は「後回しで OK」 */
export const LATER_BELOW_GAIN = 2;

/** 判定（warn / fail）のうち、どれを「今すぐ」にするか */
export type BlockingRule = readonly ("warn" | "fail")[];

/** 項目 ID → 今すぐ扱いにする判定 */
export type BlockingRules = Readonly<Record<string, BlockingRule>>;

/**
 * クイック診断（サイト・ページ）で「載らない・読まれない」原因になる項目。
 * 配点（weights.ts）とは別に、性質で決める。
 */
export const SEO_BLOCKING: BlockingRules = {
  // Googlebot / Bingbot の拒否。片方だけ（warn）でも、どちらかの検索に出なくなる
  "search-crawlers-allowed": ["fail", "warn"],
  // 検索用 AI クローラが全滅（AI 検索の引用元になれない）
  "ai-crawlers-allowed": ["fail"],
  // noindex（意図しないページ）は検索にも AI 検索にも載らない
  noindex: ["fail"],
  // robots.txt に HTML が返る・5xx（クローラがサイト全体の取得を控える）
  "robots-txt": ["fail"],
  // 本文が JavaScript 描画に依存していて、HTML だけでは読めない
  "js-rendering": ["fail"],
  // title が無い（検索結果・AI の引用に見出しが出ない）
  title: ["fail"],
};

export interface UrgencyInput {
  id: string;
  status: "warn" | "fail";
  /** 直したときの総合スコア（0〜100）の増分。小数のまま */
  gain: number;
}

/** 優先度を決める。rules に無い項目は見込み効果だけで決まる */
export function urgencyOf(input: UrgencyInput, rules: BlockingRules): Urgency {
  const blocking = rules[input.id];
  if (blocking && blocking.includes(input.status)) return "now";
  const gain = Number.isFinite(input.gain) ? input.gain : 0;
  return gain < LATER_BELOW_GAIN ? "later" : "soon";
}

export function urgencyIndex(urgency: Urgency): number {
  const i = URGENCY_ORDER.indexOf(urgency);
  return i === -1 ? URGENCY_ORDER.length : i;
}
