import type { Coverage } from "./aggregate";

/**
 * AIO トピックのラベル正規化と統合（純関数）。
 *
 * 埋め込み API は使わない（外部依存を増やさないため）。全角半角・大文字小文字・
 * 記号・空白を落とした正規形の一致と、2-gram の Dice 係数による類似度で
 * 「同じことを言っているラベル」をまとめる。
 */

/**
 * 統合するとみなす類似度のしきい値。
 *
 * 実装ガイド §15.1 は「埋め込み類似度 0.85 以上」だが、ここは埋め込み API を
 * 使わず 2-gram の Dice 係数を見ている。同じ尺度ではなく、日本語では助詞や
 * 語尾が違うだけで 0.8 前後まで落ちるため 0.72 に置く
 * （「企業における活用例」と「企業における活用事例」は統合、
 * 「企業における活用例」と「料金プランの比較」は統合しない、で調整した）。
 */
export const MERGE_THRESHOLD = 0.72;

/** 落とす記号（全角・半角の約物と括弧） */
const PUNCTUATION = /[\s　・,、，.。/／:：;；!！?？'"“”‘’`^~|=+*#@%&\-–—_(（)）[\]{}「」『』【】〈〉《》]/g;

/** 語尾の助詞・定型（「〜について」「〜とは」）は意味を変えないので落とす */
const TAIL = /(について|に関して|とは何か|とは|の解説|の説明)$/;

/**
 * 比較用の正規形。NFKC で全角英数を半角に、記号と空白を除去し小文字化する。
 * 表示にはそのまま使わない（元のラベルを保持する）。
 */
export function normalizeLabel(label: string): string {
  const base = label.normalize("NFKC").toLowerCase().replace(PUNCTUATION, "");
  const trimmed = base.replace(TAIL, "");
  return trimmed || base;
}

/** 2-gram の集合（1 文字のときはその 1 文字） */
export function bigrams(text: string): string[] {
  if (text.length <= 1) return text ? [text] : [];
  const out: string[] = [];
  for (let i = 0; i < text.length - 1; i += 1) out.push(text.slice(i, i + 2));
  return out;
}

/** 2 つのラベルの類似度（0〜1）。正規形が一致すれば 1 */
export function similarity(a: string, b: string): number {
  const na = normalizeLabel(a);
  const nb = normalizeLabel(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ga = bigrams(na);
  const gb = bigrams(nb);
  if (ga.length === 0 || gb.length === 0) return 0;
  const pool = new Map<string, number>();
  for (const g of ga) pool.set(g, (pool.get(g) ?? 0) + 1);
  let hit = 0;
  for (const g of gb) {
    const left = pool.get(g) ?? 0;
    if (left > 0) {
      pool.set(g, left - 1);
      hit += 1;
    }
  }
  return (2 * hit) / (ga.length + gb.length);
}

export interface TopicEntry {
  id: string;
  /** どのキーワードの辞書か */
  keyword: string;
  /** 表示に使う代表ラベル */
  label: string;
  /** 統合された別表記 */
  aliases: string[];
  /** 初めて観測した日（YYYY-MM-DD） */
  firstSeen: string;
}

export interface TopicMatch {
  entry: TopicEntry;
  score: number;
}

/**
 * 辞書の中から同一とみなせるトピックを探す。
 * 正規形の完全一致（代表ラベル・別表記）を優先し、無ければ最も似ているものを返す。
 */
export function matchTopic(
  entries: readonly TopicEntry[],
  label: string,
  threshold = MERGE_THRESHOLD,
): TopicMatch | null {
  const target = normalizeLabel(label);
  if (!target) return null;
  let best: TopicMatch | null = null;
  for (const entry of entries) {
    const forms = [entry.label, ...entry.aliases];
    if (forms.some((f) => normalizeLabel(f) === target)) return { entry, score: 1 };
    const score = Math.max(...forms.map((f) => similarity(f, label)));
    if (score >= threshold && (!best || score > best.score)) best = { entry, score };
  }
  return best;
}

export interface UpsertResult {
  entries: TopicEntry[];
  entry: TopicEntry;
  created: boolean;
}

/**
 * ラベルを辞書に取り込む。既存に寄せられればその ID を返し、
 * 表記が違えば別表記として記録する（辞書は新しい配列で返す）。
 */
export function upsertTopic(
  entries: readonly TopicEntry[],
  input: { keyword: string; label: string; firstSeen: string; id?: string },
  threshold = MERGE_THRESHOLD,
): UpsertResult {
  const label = input.label.trim();
  const scoped = entries.filter((e) => e.keyword === input.keyword);
  const match = matchTopic(scoped, label, threshold);
  if (match) {
    const known = [match.entry.label, ...match.entry.aliases].some(
      (f) => normalizeLabel(f) === normalizeLabel(label),
    );
    if (known) return { entries: [...entries], entry: match.entry, created: false };
    const updated: TopicEntry = { ...match.entry, aliases: [...match.entry.aliases, label] };
    return {
      entries: entries.map((e) => (e.id === updated.id ? updated : e)),
      entry: updated,
      created: false,
    };
  }
  const entry: TopicEntry = {
    id: input.id ?? `${input.keyword}:${normalizeLabel(label)}`,
    keyword: input.keyword,
    label,
    aliases: [],
    firstSeen: input.firstSeen,
  };
  return { entries: [...entries, entry], entry, created: true };
}

export interface MergeLabelsResult {
  entries: TopicEntry[];
  /** 入力ラベル -> トピック ID */
  mapping: Array<{ label: string; topicId: string; created: boolean }>;
}

/** 1 日分の抽出結果（複数ラベル）をまとめて辞書に取り込む */
export function mergeLabels(
  entries: readonly TopicEntry[],
  input: { keyword: string; labels: readonly string[]; firstSeen: string },
  threshold = MERGE_THRESHOLD,
): MergeLabelsResult {
  let current: TopicEntry[] = [...entries];
  const mapping: MergeLabelsResult["mapping"] = [];
  for (const raw of input.labels) {
    const label = raw.trim();
    if (!label) continue;
    const result = upsertTopic(current, { keyword: input.keyword, label, firstSeen: input.firstSeen }, threshold);
    current = result.entries;
    // 同じ日に同じトピックへ寄った重複は 1 件にまとめる
    if (!mapping.some((m) => m.topicId === result.entry.id)) {
      mapping.push({ label, topicId: result.entry.id, created: result.created });
    }
  }
  return { entries: current, mapping };
}

export interface CoverageJudgementLike {
  label: string;
  coverage: Coverage;
  reason?: string;
}

/**
 * LLM が返した判定ラベルを辞書のトピック ID に対応付ける。
 * 少し違うラベルで返ってきても正規化・類似度で寄せる（画面からも使うので
 * サーバー専用モジュールには置かない）。
 */
export function mapCoverageToTopics(
  topics: readonly TopicEntry[],
  judgements: readonly CoverageJudgementLike[],
): Array<{ topicId: string; coverage: Coverage; reason?: string }> {
  const out: Array<{ topicId: string; coverage: Coverage; reason?: string }> = [];
  const used = new Set<string>();
  for (const j of judgements) {
    const match = matchTopic(topics, j.label, 0.7);
    if (!match || used.has(match.entry.id)) continue;
    used.add(match.entry.id);
    out.push({ topicId: match.entry.id, coverage: j.coverage, ...(j.reason ? { reason: j.reason } : {}) });
  }
  return out;
}
