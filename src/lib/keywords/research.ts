/**
 * キーワード調査（C1）の組み立て。
 *
 * サジェスト展開・関連キーワード（SERP）・検索意図分類をまとめて
 * 1 つの KeywordsResponse にする。外部依存（fetch / SERP / LLM）は
 * すべて引数で差し替えられるので、テストはネットワークに出ない。
 */
import type { SerpProvider } from "@/lib/serp";
import { classifyIntents, type IntentClassifier } from "./intent";
import {
  dedupeKey,
  expandSuggestions,
  type ExpandResult,
  type SuggestFetcher,
  type SuggestGroup,
} from "./suggest";
import type { KeywordNote, KeywordRow, KeywordSource, KeywordsResponse } from "./types";

/** 表に出す最大件数（1 回の調査） */
export const MAX_ROWS = 500;

/** 見た目の文字数（空白込み。全角も 1 文字） */
export function keywordChars(keyword: string): number {
  return Array.from(keyword.trim()).length;
}

interface Bucket {
  keyword: string;
  sources: Set<KeywordSource>;
}

/** 出所ごとのキーワードを 1 本の表にまとめる（重複は出所をマージ） */
export function mergeSources(
  groups: readonly { source: KeywordSource; keywords: readonly string[] }[],
): { keyword: string; sources: KeywordSource[] }[] {
  const map = new Map<string, Bucket>();
  for (const group of groups) {
    for (const raw of group.keywords) {
      const keyword = raw.replace(/\s+/g, " ").trim();
      const key = dedupeKey(keyword);
      if (!key) continue;
      const existing = map.get(key);
      if (existing) existing.sources.add(group.source);
      else map.set(key, { keyword, sources: new Set([group.source]) });
    }
  }
  return Array.from(map.values()).map((b) => ({ keyword: b.keyword, sources: Array.from(b.sources) }));
}

/** 打ち切りの理由 → 画面に出す一文 */
export function suggestNote(result: ExpandResult): KeywordNote | null {
  if (!result.truncated) return null;
  const done = `${result.succeeded} / ${result.queries} 件のサジェスト取得まで`;
  switch (result.reason) {
    case "rate_limit":
      return {
        kind: "suggest_partial",
        message: `Google サジェストが連続で応答しなかったため、${done}で打ち切りました（部分的な結果です）。時間をおいて再実行すると増えることがあります。`,
      };
    case "timeout":
      return {
        kind: "suggest_partial",
        message: `時間の上限に達したため、${done}で打ち切りました（部分的な結果です）。展開する文字の種類を減らすと最後まで取得できます。`,
      };
    case "cap":
      return {
        kind: "capped",
        message: `取得件数の上限に達したため、${done}で打ち切りました。`,
      };
    case "aborted":
      return { kind: "suggest_partial", message: "処理が中止されました（途中までの結果です）。" };
    default:
      return {
        kind: "suggest_partial",
        message: `${done}で終了しました（部分的な結果です）。`,
      };
  }
}

export interface ResearchOptions {
  seed: string;
  groups: readonly SuggestGroup[];
  /** SERP プロバイダ。null なら関連キーワードは取らない */
  provider?: SerpProvider | null;
  /** 意図分類器。null なら分類しない（未分類のまま返す） */
  classifier?: IntentClassifier | null;
  /** サジェスト取得の差し替え */
  fetcher?: SuggestFetcher;
  brandTerms?: readonly string[];
  maxRows?: number;
  budgetMs?: number;
  signal?: AbortSignal;
  now?: Date;
}

export async function researchKeywords(options: ResearchOptions): Promise<KeywordsResponse> {
  const seed = options.seed.replace(/\s+/g, " ").trim();
  const notes: KeywordNote[] = [];

  const expanded = await expandSuggestions({
    seed,
    groups: options.groups,
    ...(options.fetcher ? { fetcher: options.fetcher } : {}),
    ...(options.budgetMs !== undefined ? { budgetMs: options.budgetMs } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  });
  const note = suggestNote(expanded);
  if (note) notes.push(note);

  // --- 関連キーワード / PAA（SERP プロバイダがあるときだけ） ---------------
  let relatedSearches: string[] = [];
  let relatedQuestions: string[] = [];
  const providerEnabled = Boolean(options.provider);
  if (options.provider) {
    try {
      const serp = await options.provider.search({ q: seed, device: "desktop", num: 10 });
      relatedSearches = serp.relatedSearches ?? [];
      relatedQuestions = (serp.relatedQuestions ?? []).map((q) => q.question).filter(Boolean);
    } catch (err) {
      notes.push({
        kind: "related_skipped",
        message: `関連キーワードを取得できませんでした（${err instanceof Error ? err.message : "原因不明"}）。サジェストの結果だけを表示しています。`,
      });
    }
  } else {
    notes.push({
      kind: "related_skipped",
      message:
        "関連キーワード・「他の人はこちらも質問」の取得には SERPAPI_KEY が必要です。今はサジェストのみを表示しています。",
    });
  }

  const merged = mergeSources([
    { source: "suggest", keywords: expanded.keywords },
    { source: "related", keywords: relatedSearches },
    { source: "paa", keywords: relatedQuestions },
  ]);
  const maxRows = options.maxRows ?? MAX_ROWS;
  const limited = merged.slice(0, maxRows);
  if (merged.length > limited.length) {
    notes.push({
      kind: "capped",
      message: `${merged.length} 件のうち上位 ${limited.length} 件を表示しています。`,
    });
  }

  // --- 検索意図 -----------------------------------------------------------
  const classified = await classifyIntents({
    keywords: limited.map((k) => k.keyword),
    brandTerms: options.brandTerms ?? [],
    classifier: options.classifier ?? null,
    ...(options.signal ? { signal: options.signal } : {}),
  });
  if (!options.classifier) {
    notes.push({
      kind: "intent_skipped",
      message:
        "検索意図の AI 分類には ANTHROPIC_API_KEY が必要です。ルールで判定できたものだけに意図が付いています。",
    });
  } else if (classified.llmError) {
    notes.push({
      kind: "intent_skipped",
      message: `検索意図の AI 分類に失敗しました（${classified.llmError}）。ルールで判定できたものだけに意図が付いています。`,
    });
  }

  const byKeyword = new Map(classified.items.map((i) => [i.keyword, i]));
  const rows: KeywordRow[] = limited.map((k) => {
    const c = byKeyword.get(k.keyword);
    return {
      keyword: k.keyword,
      chars: keywordChars(k.keyword),
      sources: k.sources,
      intent: c?.intent ?? null,
      judge: c?.judge ?? "unknown",
      ...(c?.matched ? { matched: c.matched } : {}),
    };
  });

  return {
    seed,
    rows,
    suggest: {
      queries: expanded.queries,
      succeeded: expanded.succeeded,
      keywords: expanded.keywords.length,
    },
    related: {
      enabled: providerEnabled,
      relatedSearches: relatedSearches.length,
      relatedQuestions: relatedQuestions.length,
    },
    intent: {
      llmEnabled: Boolean(options.classifier),
      ruleCount: classified.ruleCount,
      llmCount: classified.llmCount,
      unknownCount: classified.unknownCount,
    },
    notes,
    fetchedAt: (options.now ?? new Date()).toISOString(),
  };
}
