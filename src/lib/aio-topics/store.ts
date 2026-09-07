/**
 * AIO 頻出トピックのブラウザ側ストア（localStorage + zod）。
 *
 * キーワードごとに「トピック辞書」「日次の出現」「自社ページのカバー判定」を持つ。
 * サーバーは 1 回分の抽出結果を返すだけで、履歴の積み上げはここで行う。
 */
import { z } from "zod";
import { createStore } from "@/lib/store";
import type { AioTopicDay, Coverage } from "./aggregate";
import { mergeLabels, type TopicEntry } from "./normalize";

/** キーワード 1 本あたりに残す日数 */
export const MAX_DAYS_PER_KEYWORD = 180;

export const TopicEntrySchema = z.object({
  id: z.string().min(1),
  keyword: z.string(),
  label: z.string(),
  aliases: z.array(z.string()),
  firstSeen: z.string(),
});

export const AioTopicDaySchema = z.object({
  keyword: z.string(),
  takenOn: z.string(),
  aioPresent: z.boolean(),
  selfCited: z.boolean(),
  topicIds: z.array(z.string()),
  /** 抽出の根拠（トピック ID -> AIO 本文の該当部分） */
  evidence: z.record(z.string(), z.string()).optional(),
});

export const CoverageRecordSchema = z.object({
  keyword: z.string(),
  topicId: z.string(),
  pageUrl: z.string(),
  coverage: z.enum(["full", "partial", "none"]),
  judgedAt: z.string(),
  reason: z.string().optional(),
});

export const AioTopicSettingsSchema = z.object({
  keyword: z.string(),
  device: z.enum(["desktop", "mobile"]),
  location: z.string(),
  pageUrl: z.string(),
});

export type CoverageRecord = z.infer<typeof CoverageRecordSchema>;
export type AioTopicSettings = z.infer<typeof AioTopicSettingsSchema>;

export const aioTopicDictStore = createStore<TopicEntry[]>("aioTopicDict", z.array(TopicEntrySchema), []);
export const aioTopicDaysStore = createStore<AioTopicDay[]>("aioTopicDays", z.array(AioTopicDaySchema), []);
export const aioTopicCoverageStore = createStore<CoverageRecord[]>(
  "aioTopicCoverage",
  z.array(CoverageRecordSchema),
  [],
);
export const aioTopicSettingsStore = createStore<AioTopicSettings>("aioTopicSettings", AioTopicSettingsSchema, {
  keyword: "",
  device: "desktop",
  location: "",
  pageUrl: "",
});

/** 同じキーワード・同じ日は後勝ち。古い日から捨てる */
export function mergeDays(prev: readonly AioTopicDay[], incoming: readonly AioTopicDay[]): AioTopicDay[] {
  const map = new Map<string, AioTopicDay>();
  for (const d of [...prev, ...incoming]) map.set(`${d.keyword} ${d.takenOn}`, d);
  const byKeyword = new Map<string, AioTopicDay[]>();
  for (const d of map.values()) {
    const list = byKeyword.get(d.keyword) ?? [];
    list.push(d);
    byKeyword.set(d.keyword, list);
  }
  const out: AioTopicDay[] = [];
  for (const list of byKeyword.values()) {
    list.sort((a, b) => a.takenOn.localeCompare(b.takenOn));
    out.push(...list.slice(-MAX_DAYS_PER_KEYWORD));
  }
  return out.sort((a, b) => a.takenOn.localeCompare(b.takenOn) || a.keyword.localeCompare(b.keyword));
}

export interface ExtractionInput {
  keyword: string;
  takenOn: string;
  aioPresent: boolean;
  selfCited: boolean;
  topics: ReadonlyArray<{ label: string; evidence?: string }>;
}

export interface ExtractionResult {
  dict: TopicEntry[];
  day: AioTopicDay;
}

/**
 * 1 回分の抽出結果を辞書に取り込み、その日の出現トピックを作る（保存はしない）。
 * ラベルの正規化・統合は normalize.ts に任せる。
 */
export function applyExtraction(dict: readonly TopicEntry[], input: ExtractionInput): ExtractionResult {
  const { entries, mapping } = mergeLabels(dict, {
    keyword: input.keyword,
    labels: input.topics.map((t) => t.label),
    firstSeen: input.takenOn,
  });
  const evidence: Record<string, string> = {};
  for (const m of mapping) {
    const source = input.topics.find((t) => t.label.trim() === m.label);
    if (source?.evidence) evidence[m.topicId] = source.evidence;
  }
  const day: AioTopicDay = {
    keyword: input.keyword,
    takenOn: input.takenOn,
    aioPresent: input.aioPresent,
    selfCited: input.selfCited,
    topicIds: mapping.map((m) => m.topicId),
    ...(Object.keys(evidence).length > 0 ? { evidence } : {}),
  };
  return { dict: entries, day };
}

/** 抽出結果をストアへ保存する */
export function saveExtraction(input: ExtractionInput): ExtractionResult {
  const result = applyExtraction(aioTopicDictStore.get(), input);
  aioTopicDictStore.set(result.dict);
  aioTopicDaysStore.update((prev) => mergeDays(prev, [result.day]));
  return result;
}

/** カバー判定を保存する（キーワード・トピック・ページ URL の 3 つで一意） */
export function saveCoverage(records: readonly CoverageRecord[]): void {
  if (records.length === 0) return;
  aioTopicCoverageStore.update((prev) => {
    const map = new Map<string, CoverageRecord>();
    for (const r of [...prev, ...records]) map.set(`${r.keyword} ${r.topicId} ${r.pageUrl}`, r);
    return Array.from(map.values());
  });
}

/** トピック ID -> カバー状況（指定ページ分だけ） */
export function coverageMap(
  records: readonly CoverageRecord[],
  keyword: string,
  pageUrl: string,
): Record<string, Coverage> {
  const out: Record<string, Coverage> = {};
  for (const r of records) {
    if (r.keyword !== keyword || r.pageUrl !== pageUrl) continue;
    out[r.topicId] = r.coverage;
  }
  return out;
}

export function topicsForKeyword(dict: readonly TopicEntry[], keyword: string): TopicEntry[] {
  return dict.filter((t) => t.keyword === keyword);
}

export function daysForKeyword(days: readonly AioTopicDay[], keyword: string): AioTopicDay[] {
  return days.filter((d) => d.keyword === keyword).sort((a, b) => a.takenOn.localeCompare(b.takenOn));
}

/** 履歴に残っているキーワード（新しい順） */
export function storedKeywords(days: readonly AioTopicDay[]): string[] {
  const latest = new Map<string, string>();
  for (const d of days) {
    const prev = latest.get(d.keyword);
    if (!prev || d.takenOn > prev) latest.set(d.keyword, d.takenOn);
  }
  return Array.from(latest.entries())
    .sort((a, b) => b[1].localeCompare(a[1]))
    .map(([keyword]) => keyword);
}

/** キーワードに紐づく記録をすべて消す */
export function removeKeywordData(keyword: string): void {
  aioTopicDaysStore.update((prev) => prev.filter((d) => d.keyword !== keyword));
  aioTopicDictStore.update((prev) => prev.filter((t) => t.keyword !== keyword));
  aioTopicCoverageStore.update((prev) => prev.filter((c) => c.keyword !== keyword));
}
