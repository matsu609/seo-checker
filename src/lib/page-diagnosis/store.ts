/**
 * ページ診断のブラウザ側ストア（localStorage + zod）。
 *
 * サーバーは状態を持たないので、診断結果は (キーワード, 対象 URL) をキーに
 * ここへ保存する。リロードしても結果が残り、過去の診断を一覧から開ける。
 * 本文（mainText）は 1 ページで数万文字あり容量を食うので保存しない。
 */
import { z } from "zod";
import { createStore } from "@/lib/store";
import type { DiagnosisResult } from "./types";

/** 保存しておく診断の件数（古いものから捨てる） */
export const MAX_DIAGNOSES = 20;

const HeadingSchema = z.object({ level: z.number(), text: z.string() });

const MeasurementSchema = z.object({
  url: z.string(),
  finalUrl: z.string(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  charCount: z.number(),
  images: z.number(),
  headings: z.array(HeadingSchema),
  h1: z.array(z.string()),
  internalLinks: z.number(),
  externalLinks: z.number(),
  fetchMs: z.number(),
  jsonLdTypes: z.array(z.string()),
  publishedAt: z.string().nullable(),
  modifiedAt: z.string().nullable(),
  mainText: z.string(),
});

const MetricStatsSchema = z.object({
  count: z.number(),
  average: z.number().nullable(),
  median: z.number().nullable(),
  min: z.number().nullable(),
  max: z.number().nullable(),
  self: z.number().nullable(),
  gap: z.number().nullable(),
  ratio: z.number().nullable(),
});

const StatsSchema = z.object({
  charCount: MetricStatsSchema,
  images: MetricStatsSchema,
  internalLinks: MetricStatsSchema,
  externalLinks: MetricStatsSchema,
  fetchMs: MetricStatsSchema,
  headings: MetricStatsSchema,
});

const AnalysisSchema = z.object({
  summary: z.string(),
  title_suggestions: z.array(z.string()),
  description_suggestions: z.array(z.string()),
  search_intent: z.string(),
  serp_trend: z.string(),
  technical_issues: z.array(z.object({ issue: z.string(), fix: z.string() })),
  content_proposals: z.array(z.object({ location: z.string(), outline: z.string(), reason: z.string() })),
});

const SerpEntrySchema = z.object({
  position: z.number(),
  title: z.string(),
  url: z.string(),
  snippet: z.string().optional(),
});

export const DiagnosisResultSchema = z.object({
  id: z.string().min(1),
  keyword: z.string(),
  device: z.enum(["desktop", "mobile"]),
  location: z.string().optional(),
  projectDomain: z.string().optional(),
  targetUrl: z.string().nullable(),
  targetOrigin: z.enum(["input", "serp", "none"]),
  serpSource: z.enum(["serpapi", "web_search"]),
  top10: z.array(SerpEntrySchema),
  features: z.array(z.string()),
  relatedQuestions: z.array(
    z.object({ question: z.string(), snippet: z.string().optional(), title: z.string().optional(), url: z.string().optional() }),
  ),
  aiOverviewPresent: z.boolean(),
  self: MeasurementSchema.nullable(),
  competitors: z.array(
    z.object({
      position: z.number(),
      title: z.string(),
      url: z.string(),
      snippet: z.string().optional(),
      measurement: MeasurementSchema.nullable(),
    }),
  ),
  failures: z.array(z.object({ url: z.string(), position: z.number().nullable(), reason: z.string() })),
  stats: StatsSchema,
  analysis: AnalysisSchema.nullable(),
  model: z.string().nullable(),
  notes: z.array(z.string()),
  createdAt: z.string(),
});

/** 型は types.ts が正。スキーマとずれたらここで型エラーになる */
export type StoredDiagnosis = z.infer<typeof DiagnosisResultSchema>;

export const pageDiagnosesStore = createStore<StoredDiagnosis[]>(
  "pageDiagnoses",
  z.array(DiagnosisResultSchema),
  [],
);

export const PageDiagnosisSettingsSchema = z.object({
  keyword: z.string(),
  url: z.string(),
  device: z.enum(["desktop", "mobile"]),
  location: z.string(),
});

export type PageDiagnosisSettings = z.infer<typeof PageDiagnosisSettingsSchema>;

export const pageDiagnosisSettingsStore = createStore<PageDiagnosisSettings>(
  "pageDiagnosisSettings",
  PageDiagnosisSettingsSchema,
  { keyword: "", url: "", device: "desktop", location: "" },
);

/** (キーワード, 対象 URL) の組から安定した ID を作る */
export function diagnosisId(keyword: string, url: string | null): string {
  const key = `${keyword.trim().toLowerCase()}|${(url ?? "").trim().toLowerCase()}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < key.length; i += 1) {
    const c = key.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 + c, 2654435761) >>> 0;
  }
  return `${h1.toString(16)}${h2.toString(16)}`;
}

/** 保存前に本文を落とす（localStorage の容量対策。表示には使わない） */
export function stripText(result: DiagnosisResult): StoredDiagnosis {
  const strip = <T extends { mainText: string } | null>(m: T): T =>
    (m ? { ...m, mainText: "" } : m) as T;
  return {
    ...result,
    self: strip(result.self),
    competitors: result.competitors.map((c) => ({ ...c, measurement: strip(c.measurement) })),
  };
}

/** 同じ (キーワード, URL) は上書きし、新しい順に並べて上限で切る（純関数） */
export function mergeDiagnoses(
  prev: readonly StoredDiagnosis[],
  incoming: StoredDiagnosis,
): StoredDiagnosis[] {
  const rest = prev.filter((d) => d.id !== incoming.id);
  return [incoming, ...rest]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, MAX_DIAGNOSES);
}

export function saveDiagnosis(result: DiagnosisResult): void {
  const stored = stripText(result);
  pageDiagnosesStore.update((prev) => mergeDiagnoses(prev, stored));
}

export function removeDiagnosis(id: string): void {
  pageDiagnosesStore.update((prev) => prev.filter((d) => d.id !== id));
}

export function findDiagnosis(list: readonly StoredDiagnosis[], id: string): StoredDiagnosis | null {
  return list.find((d) => d.id === id) ?? null;
}
