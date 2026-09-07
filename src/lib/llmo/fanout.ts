/**
 * AI クエリファンアウト（B8）の集計（純関数）。
 *
 * ファンアウト = LLM が 1 つのプロンプトに答えるために内部で発行した検索クエリ。
 * B4 の実行結果に含まれているので、追加の API コストはかからない。
 */
import { PROVIDERS_META, PROVIDER_IDS, type ProviderId } from "./providers/meta";
import type { LlmoRun } from "./types";

/**
 * 「最新情報」を求めるクエリか。
 * 「最新」「今年」「現在」「YYYY 年」を含むものをフラグ付けする（実装ガイド 17.1）。
 */
export function isFreshQuery(query: string): boolean {
  const q = query.normalize("NFKC");
  if (/最新|今年|現在/.test(q)) return true;
  return /(?:19|20)\d{2}\s*年/.test(q);
}

/** クエリの表記ゆれをまとめるための正規化（頻度集計のキー） */
export function normalizeQuery(query: string): string {
  return query.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
}

export interface FanoutRow {
  runId: string;
  takenOn: string;
  promptId: string;
  promptText: string;
  providerId: ProviderId;
  query: string;
  fresh: boolean;
}

/** プロンプト × プラットフォーム × クエリの一覧（新しい日付が先） */
export function fanoutRows(runs: readonly LlmoRun[]): FanoutRow[] {
  const out: FanoutRow[] = [];
  for (const run of runs) {
    if (run.status !== "ok") continue;
    for (const query of run.searchQueries) {
      const text = query.trim();
      if (!text) continue;
      out.push({
        runId: run.id,
        takenOn: run.takenOn,
        promptId: run.promptId,
        promptText: run.promptText,
        providerId: run.providerId,
        query: text,
        fresh: isFreshQuery(text),
      });
    }
  }
  return out.sort((a, b) => b.takenOn.localeCompare(a.takenOn) || a.promptText.localeCompare(b.promptText, "ja"));
}

export interface FanoutFrequencyRow {
  /** 代表表記（最初に見つかったもの） */
  query: string;
  count: number;
  /** このクエリが出たプロンプトの数 */
  promptCount: number;
  providers: ProviderId[];
  fresh: boolean;
}

/** プロンプト横断で頻出するクエリ（コンテンツ企画の候補） */
export function fanoutFrequency(rows: readonly FanoutRow[], limit = 50): FanoutFrequencyRow[] {
  const map = new Map<
    string,
    { query: string; count: number; prompts: Set<string>; providers: Set<ProviderId>; fresh: boolean }
  >();
  for (const row of rows) {
    const key = normalizeQuery(row.query);
    if (!key) continue;
    const found = map.get(key);
    if (found) {
      found.count += 1;
      found.prompts.add(row.promptId);
      found.providers.add(row.providerId);
      found.fresh = found.fresh || row.fresh;
    } else {
      map.set(key, {
        query: row.query,
        count: 1,
        prompts: new Set([row.promptId]),
        providers: new Set([row.providerId]),
        fresh: row.fresh,
      });
    }
  }
  return Array.from(map.values())
    .map((v) => ({
      query: v.query,
      count: v.count,
      promptCount: v.prompts.size,
      providers: PROVIDER_IDS.filter((id) => v.providers.has(id)),
      fresh: v.fresh,
    }))
    .sort((a, b) => b.promptCount - a.promptCount || b.count - a.count || a.query.localeCompare(b.query, "ja"))
    .slice(0, limit);
}

export interface FanoutSupportRow {
  providerId: ProviderId;
  label: string;
  supported: boolean;
  /** 取得できたクエリの本数 */
  queries: number;
  /** 集計した回答数 */
  answers: number;
}

/** プロバイダごとのファンアウト取得可否と件数（「対象外」を明記するため） */
export function fanoutSupport(runs: readonly LlmoRun[]): FanoutSupportRow[] {
  return PROVIDER_IDS.map((providerId) => {
    const list = runs.filter((r) => r.providerId === providerId && r.status === "ok");
    return {
      providerId,
      label: PROVIDERS_META[providerId].label,
      supported: PROVIDERS_META[providerId].fanoutSupported,
      queries: list.reduce((sum, r) => sum + r.searchQueries.filter((q) => q.trim()).length, 0),
      answers: list.length,
    };
  });
}
