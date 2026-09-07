/**
 * Google オートコンプリート（サジェスト）の展開（実装ガイド §8.1）。
 *
 * 種キーワードそのものに加えて「種 + あ〜ん / a〜z / 0〜9」を投げ、
 * 返ってきた候補を重複除去してまとめる。非公式エンドポイントなので
 * 高頻度に叩くと 429 やブロックが返る。ここでは
 *   ・同時実行を絞る（既定 4 本）
 *   ・全体の時間予算を持つ
 *   ・連続で失敗したら残りを打ち切って「部分結果」として返す
 * の 3 点で degrade させ、途中結果でも画面が成立するようにしている。
 */
import { assertPublicHost, fetchText, normalizeUrl } from "@/lib/analyzer/fetch";

export const SUGGEST_ENDPOINT = "https://www.google.com/complete/search";

/** 展開に使う修飾子のグループ */
export type SuggestGroup = "kana" | "alpha" | "digit";

/** あ行〜ん（濁音・拗音は除く。48 → 46 文字） */
export const HIRAGANA: readonly string[] = [
  "あ", "い", "う", "え", "お",
  "か", "き", "く", "け", "こ",
  "さ", "し", "す", "せ", "そ",
  "た", "ち", "つ", "て", "と",
  "な", "に", "ぬ", "ね", "の",
  "は", "ひ", "ふ", "へ", "ほ",
  "ま", "み", "む", "め", "も",
  "や", "ゆ", "よ",
  "ら", "り", "る", "れ", "ろ",
  "わ", "を", "ん",
];

export const ALPHABET: readonly string[] = Array.from({ length: 26 }, (_, i) =>
  String.fromCharCode(97 + i),
);

export const DIGITS: readonly string[] = Array.from({ length: 10 }, (_, i) => String(i));

export function modifiersOf(groups: readonly SuggestGroup[]): string[] {
  const out: string[] = [];
  if (groups.includes("kana")) out.push(...HIRAGANA);
  if (groups.includes("alpha")) out.push(...ALPHABET);
  if (groups.includes("digit")) out.push(...DIGITS);
  return out;
}

/** 種 KW と修飾子から、投げるクエリの一覧を作る（先頭は種 KW そのもの） */
export function buildQueries(seed: string, groups: readonly SuggestGroup[]): string[] {
  const base = seed.trim().replace(/\s+/g, " ");
  if (!base) return [];
  const queries = [base];
  for (const m of modifiersOf(groups)) queries.push(`${base} ${m}`);
  return queries;
}

/** サジェストの取得 URL。client=firefox にすると素の JSON 配列が返る */
export function buildSuggestUrl(query: string, hl = "ja"): string {
  const params = new URLSearchParams({ client: "firefox", hl, q: query });
  return `${SUGGEST_ENDPOINT}?${params.toString()}`;
}

/**
 * 応答本文 → 候補の配列。
 * 形は `["種", ["候補1", "候補2", …], …]`。JSONP で包まれていても剥がす。
 * 想定外の形（HTML のブロックページなど）では null を返し、呼び出し側が失敗として数える。
 */
export function parseSuggestResponse(body: string): string[] | null {
  const text = body.trim();
  if (!text) return null;
  // window.google.ac.h([...]) のような JSONP を剥がす。
  // 改行を含む本文にも当てたいが tsconfig の target が ES2017 なので
  // s フラグは使えない。[\s\S] で代用する。
  const jsonp = /^[\w.]+\(([\s\S]*)\)\s*;?$/.exec(text);
  const source = jsonp ? jsonp[1] : text;
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length < 2) return null;
  const list = parsed[1];
  if (!Array.isArray(list)) return null;
  const out: string[] = [];
  for (const item of list) {
    // client によっては ["候補", 0, [...]] の配列で返る
    const value = Array.isArray(item) ? item[0] : item;
    if (typeof value !== "string") continue;
    const s = value.replace(/\s+/g, " ").trim();
    if (s) out.push(s);
  }
  return out;
}

/** 表記ゆれを潰した比較キー（前後空白・連続空白・大文字小文字） */
export function dedupeKey(keyword: string): string {
  return keyword.replace(/\s+/g, " ").trim().toLowerCase();
}

/** 順序を保ったまま重複を除く */
export function dedupeKeywords(keywords: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of keywords) {
    const key = dedupeKey(k);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(k.replace(/\s+/g, " ").trim());
  }
  return out;
}

export interface SuggestFetchResult {
  ok: boolean;
  status: number;
  body: string;
}

/** 差し替え可能な取得関数（テストはこれを渡してネットワークに出ない） */
export type SuggestFetcher = (url: string, signal?: AbortSignal) => Promise<SuggestFetchResult>;

/** 既定の取得関数。外部 URL なので assertPublicHost → fetchText を通す */
export function createSuggestFetcher(): SuggestFetcher {
  let checked: Promise<void> | null = null;
  return async (url) => {
    const target = normalizeUrl(url);
    // ホスト検査は 1 回で足りる（同じホストへ数十回投げるため）
    if (!checked) checked = assertPublicHost(target);
    await checked;
    const res = await fetchText(target.toString(), { timeoutMs: 6_000, maxBytes: 256 * 1024 });
    return { ok: res.ok, status: res.status, body: res.body };
  };
}

export interface ExpandOptions {
  seed: string;
  groups: readonly SuggestGroup[];
  fetcher?: SuggestFetcher;
  /** 同時実行数（既定 4） */
  concurrency?: number;
  /** 全体の時間予算 ms（既定 25 秒） */
  budgetMs?: number;
  /** 何件連続で失敗したら打ち切るか（既定 6） */
  failureLimit?: number;
  /** 集める上限（既定 600） */
  maxKeywords?: number;
  hl?: string;
  signal?: AbortSignal;
  now?: () => number;
}

export interface ExpandResult {
  keywords: string[];
  /** 投げる予定だったクエリ数 */
  queries: number;
  /** 実際に成功したクエリ数 */
  succeeded: number;
  /** 失敗したクエリ数 */
  failed: number;
  /** 打ち切ったか（時間切れ・連続失敗・上限） */
  truncated: boolean;
  /** 打ち切りの理由（truncated のときだけ） */
  reason: "rate_limit" | "timeout" | "cap" | "aborted" | null;
}

export const DEFAULT_GROUPS: readonly SuggestGroup[] = ["kana", "alpha"];
export const DEFAULT_CONCURRENCY = 4;
export const DEFAULT_BUDGET_MS = 25_000;
export const DEFAULT_FAILURE_LIMIT = 6;
export const DEFAULT_MAX_KEYWORDS = 600;

/**
 * サジェストを展開する。
 * 途中で打ち切っても、それまでに集まった候補はそのまま返す（部分結果 + note）。
 */
export async function expandSuggestions(options: ExpandOptions): Promise<ExpandResult> {
  const queries = buildQueries(options.seed, options.groups);
  const fetcher = options.fetcher ?? createSuggestFetcher();
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
  const budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS;
  const failureLimit = options.failureLimit ?? DEFAULT_FAILURE_LIMIT;
  const maxKeywords = options.maxKeywords ?? DEFAULT_MAX_KEYWORDS;
  const hl = options.hl ?? "ja";
  const now = options.now ?? (() => Date.now());
  const startedAt = now();

  const collected: string[] = [];
  const seen = new Set<string>();
  let succeeded = 0;
  let failed = 0;
  let consecutiveFailures = 0;
  let stop: ExpandResult["reason"] = null;
  let index = 0;

  function push(keyword: string): void {
    const key = dedupeKey(keyword);
    if (!key || seen.has(key)) return;
    seen.add(key);
    collected.push(keyword.replace(/\s+/g, " ").trim());
  }

  async function worker(): Promise<void> {
    for (;;) {
      if (stop) return;
      if (options.signal?.aborted) {
        stop = "aborted";
        return;
      }
      if (now() - startedAt > budgetMs) {
        stop = "timeout";
        return;
      }
      if (collected.length >= maxKeywords) {
        stop = "cap";
        return;
      }
      const i = index++;
      if (i >= queries.length) return;
      let list: string[] | null = null;
      try {
        const res = await fetcher(buildSuggestUrl(queries[i], hl), options.signal);
        list = res.ok ? parseSuggestResponse(res.body) : null;
      } catch {
        list = null;
      }
      if (list === null) {
        failed += 1;
        consecutiveFailures += 1;
        // 連続で失敗するのはブロック / レート制限。粘らずに部分結果で返す
        if (consecutiveFailures >= failureLimit) stop = "rate_limit";
        continue;
      }
      succeeded += 1;
      consecutiveFailures = 0;
      for (const k of list) push(k);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, queries.length) }, () => worker()));

  return {
    keywords: collected.slice(0, maxKeywords),
    queries: queries.length,
    succeeded,
    failed,
    truncated: stop !== null || index < queries.length,
    reason: stop,
  };
}
