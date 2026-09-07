/**
 * 一発生成（D1）の下ごしらえ: 上位 10 件の取得と本文の要約（サーバー専用）。
 *
 * SERP 取得と本文抽出はページ診断（A4）の実装をそのまま読み取り専用で使う。
 * SERPAPI_KEY が無いときは「上位分析なし」で構成案を作る（推定順位で
 * 上位ページを名乗る記事を書かせないため、ここでは Web 検索による推定はしない）。
 */
import { measureMany, type PageFetcher } from "@/lib/page-diagnosis/measure";
import { fetchTop10 } from "@/lib/page-diagnosis/serp";
import type { SerpProvider } from "@/lib/serp/types";
import { MAX_REFERENCE_CHARS } from "./prompt";
import type { OutlineSerpEntry } from "./types";

/** 本文まで取りに行く上位ページの数（相手サイトへの負荷と時間の兼ね合い） */
export const MAX_REFERENCE_PAGES = 5;

/** 上位 1 ページ分の要約（LLM に渡す素材。すべて第三者のテキスト） */
export interface SerpBrief {
  position: number;
  title: string;
  url: string;
  snippet?: string;
  /** 見出し（h2/h3 まで） */
  headings: string[];
  /** 本文の冒頭（MAX_REFERENCE_CHARS で切り詰め済み） */
  text: string;
  charCount: number | null;
}

export interface ResearchInput {
  keyword: string;
  provider: SerpProvider;
  signal?: AbortSignal;
  /** 差し替え用（テスト） */
  fetcher?: PageFetcher;
}

export interface ResearchResult {
  entries: OutlineSerpEntry[];
  briefs: SerpBrief[];
  relatedQuestions: string[];
  notes: string[];
}

/** SERP の上位を取り、本文を取れたページだけ要約にする */
export async function researchTop10(input: ResearchInput): Promise<ResearchResult> {
  const top10 = await fetchTop10(input.provider, {
    keyword: input.keyword,
    device: "desktop",
    ...(input.signal ? { signal: input.signal } : {}),
  });

  const entries: OutlineSerpEntry[] = top10.entries.map((e) => ({
    position: e.position,
    title: e.title,
    url: e.url,
  }));

  const targets = top10.entries
    .slice(0, MAX_REFERENCE_PAGES)
    .map((e) => ({ url: e.url, position: e.position }));

  const measured = await measureMany({
    targets,
    ...(input.fetcher ? { fetcher: input.fetcher } : {}),
    ...(input.signal ? { signal: input.signal } : {}),
  });

  const byPosition = new Map(measured.measurements.map((m) => [m.position, m.measurement]));
  const briefs: SerpBrief[] = [];
  for (const entry of top10.entries.slice(0, MAX_REFERENCE_PAGES)) {
    const m = byPosition.get(entry.position);
    if (!m) continue;
    briefs.push({
      position: entry.position,
      title: entry.title,
      url: entry.url,
      ...(entry.snippet ? { snippet: entry.snippet } : {}),
      headings: m.headings.filter((h) => h.level <= 3).map((h) => `${"#".repeat(h.level)} ${h.text}`).slice(0, 20),
      text: m.mainText.slice(0, MAX_REFERENCE_CHARS),
      charCount: m.charCount,
    });
  }

  const notes: string[] = [];
  if (briefs.length === 0) {
    notes.push("上位ページの本文を 1 件も取得できなかったため、上位分析なしで構成案を作りました。");
  } else if (briefs.length < targets.length) {
    notes.push(`上位 ${targets.length} 件のうち ${briefs.length} 件の本文を分析しました（残りは取得できませんでした）。`);
  }

  return {
    entries,
    briefs,
    relatedQuestions: top10.relatedQuestions.map((q) => q.question).slice(0, 8),
    notes,
  };
}
