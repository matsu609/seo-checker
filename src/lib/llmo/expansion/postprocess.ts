/**
 * 生成結果の後処理（純関数）。文字数付与・近い文の除去・カテゴリごとの件数制限。
 *
 * 実装ガイド §16.1 は「埋め込み類似度 0.92 以上を重複として除去」だが、
 * 埋め込み API を足さずに済むよう、文字 bigram の Dice 係数で近似する。
 * 尺度が違うのでしきい値も揃わない（日本語の短文では、意図が違う
 * 「選び方を教えて」/「料金を教えて」でも 0.72 前後になる）。表記・記号違いだけを
 * 落として、意味の違うプロンプトは残す側に倒し 0.85 にしてある。
 */
import { CATEGORY_NAMES, categoryDefinition, isCategoryName, type ExpandedCategory, type ExpandedPrompt, type PromptCategoryName } from "./types";

/** 既定のしきい値。これ以上似ていれば重複とみなす */
export const SIMILARITY_THRESHOLD = 0.85;

/** 全角も 1 文字として数える（絵文字などのサロゲートペアも 1 文字） */
export function charCount(text: string): number {
  return Array.from(text.trim()).length;
}

/** 比較用の正規化（NFKC・小文字・空白と記号の除去） */
export function normalizeForCompare(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s　]/g, "")
    .replace(/[。、.,!！?？「」『』（）()・:：;；\-–—~〜"'“”‘’]/g, "");
}

/** 文字 bigram の集合（1 文字の語はそのまま 1 要素） */
export function bigrams(text: string): Set<string> {
  const chars = Array.from(normalizeForCompare(text));
  if (chars.length <= 1) return new Set(chars);
  const out = new Set<string>();
  for (let i = 0; i < chars.length - 1; i += 1) out.add(chars[i] + chars[i + 1]);
  return out;
}

/** Dice 係数（0〜1）。完全一致は 1、共通部分が無ければ 0 */
export function similarity(a: string, b: string): number {
  const na = normalizeForCompare(a);
  const nb = normalizeForCompare(b);
  if (!na || !nb) return na === nb ? 1 : 0;
  if (na === nb) return 1;
  const sa = bigrams(na);
  const sb = bigrams(nb);
  if (sa.size === 0 || sb.size === 0) return 0;
  let shared = 0;
  for (const g of sa) if (sb.has(g)) shared += 1;
  return (2 * shared) / (sa.size + sb.size);
}

/**
 * 近い文を落とす（先に出てきたほうを残す）。カテゴリをまたいで比較する
 * （同じ質問が「比較・選定」と「情報収集・定義」に二重に出るのを防ぐ）。
 */
export function dedupePrompts(texts: readonly string[], threshold = SIMILARITY_THRESHOLD): string[] {
  const kept: string[] = [];
  for (const raw of texts) {
    const text = raw.trim();
    if (!text) continue;
    if (kept.some((k) => similarity(k, text) >= threshold)) continue;
    kept.push(text);
  }
  return kept;
}

export interface RawCategory {
  name: string;
  prompts: string[];
}

export interface BuildOptions {
  /** 目標本数。超えた分はカテゴリを順番に回りながら削る */
  total: number;
  /** 1 カテゴリの上限（既定は total の 1/3） */
  perCategoryMax?: number;
  threshold?: number;
}

/**
 * LLM の生の出力 → 画面に出すカテゴリ配列。
 * - 既定 8 カテゴリの順に並べ、未知のカテゴリ名は捨てる
 * - 全体で重複を除去し、カテゴリごとに上限を掛け、目標本数まで均等に間引く
 */
export function buildCategories(raw: readonly RawCategory[], options: BuildOptions): ExpandedCategory[] {
  const perCategoryMax = options.perCategoryMax ?? Math.max(4, Math.ceil(options.total / 3));
  const threshold = options.threshold ?? SIMILARITY_THRESHOLD;

  // カテゴリ名でまとめる（同じ名前が複数回来ても 1 つにする）
  const byName = new Map<PromptCategoryName, string[]>();
  for (const category of raw) {
    if (!isCategoryName(category.name)) continue;
    const list = byName.get(category.name) ?? [];
    list.push(...category.prompts);
    byName.set(category.name, list);
  }

  // 全体で重複除去（先に出た順を尊重するため、カテゴリ定義順に流す）
  const seen: string[] = [];
  const cleaned = new Map<PromptCategoryName, string[]>();
  for (const name of CATEGORY_NAMES) {
    const list = byName.get(name) ?? [];
    const kept: string[] = [];
    for (const raw2 of list) {
      const text = raw2.trim().replace(/\s+/g, " ");
      if (!text) continue;
      if (seen.some((s) => similarity(s, text) >= threshold)) continue;
      seen.push(text);
      kept.push(text);
      if (kept.length >= perCategoryMax) break;
    }
    if (kept.length > 0) cleaned.set(name, kept);
  }

  // 目標本数まで、カテゴリを 1 本ずつ順に取る（1 カテゴリに偏らせない）
  const picked = new Map<PromptCategoryName, string[]>();
  let taken = 0;
  for (let round = 0; taken < options.total; round += 1) {
    let addedThisRound = 0;
    for (const [name, list] of cleaned) {
      if (round >= list.length) continue;
      const current = picked.get(name) ?? [];
      current.push(list[round]);
      picked.set(name, current);
      taken += 1;
      addedThisRound += 1;
      if (taken >= options.total) break;
    }
    if (addedThisRound === 0) break;
  }

  return CATEGORY_NAMES.filter((name) => (picked.get(name)?.length ?? 0) > 0).map((name) => ({
    name,
    definition: categoryDefinition(name),
    prompts: (picked.get(name) ?? []).map<ExpandedPrompt>((text) => ({ text, chars: charCount(text) })),
  }));
}

/** カテゴリ配列の合計本数 */
export function countPrompts(categories: readonly ExpandedCategory[]): number {
  return categories.reduce((sum, c) => sum + c.prompts.length, 0);
}

/** コピー用テキスト（カテゴリ名を入れるかどうかで 2 通り） */
export function promptsToText(categories: readonly ExpandedCategory[], withCategory: boolean): string {
  const lines: string[] = [];
  for (const category of categories) {
    for (const p of category.prompts) lines.push(withCategory ? `${category.name}\t${p.text}` : p.text);
  }
  return lines.join("\n");
}
