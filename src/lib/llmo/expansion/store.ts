/**
 * プロンプト拡張のブラウザ側ストア（localStorage + zod）。
 * 入力（参考プロンプト・対象サイト・生成数）と生成結果の履歴を残す。
 */
import { z } from "zod";
import { createStore, newId } from "@/lib/store";
import { CATEGORY_NAMES, DEFAULT_COUNT, type ExpansionResult } from "./types";

/** 残す履歴の件数（1 件あたり 50 本程度なので軽い） */
export const MAX_EXPANSIONS = 20;

const ExpandedPromptSchema = z.object({ text: z.string(), chars: z.number() });

const SiteContextSchema = z.object({
  url: z.string(),
  title: z.string().nullable(),
  description: z.string().nullable(),
  navLabels: z.array(z.string()),
  headings: z.array(z.string()),
});

export const ExpansionResultSchema = z.object({
  seedPrompts: z.array(z.string()),
  siteUrl: z.string(),
  site: SiteContextSchema.nullable(),
  siteError: z.string().nullable(),
  categories: z.array(
    z.object({
      name: z.enum(CATEGORY_NAMES),
      definition: z.string(),
      prompts: z.array(ExpandedPromptSchema),
    }),
  ),
  total: z.number(),
  requested: z.number(),
  model: z.string(),
  generatedAt: z.string(),
});

export const StoredExpansionSchema = z.object({
  id: z.string().min(1),
  projectId: z.string(),
  result: ExpansionResultSchema,
});

export type StoredExpansion = z.infer<typeof StoredExpansionSchema>;

export const ExpansionSettingsSchema = z.object({
  seedText: z.string(),
  siteUrl: z.string(),
  count: z.number(),
});

export type ExpansionSettings = z.infer<typeof ExpansionSettingsSchema>;

export const promptExpansionsStore = createStore<StoredExpansion[]>(
  "promptExpansions",
  z.array(StoredExpansionSchema),
  [],
);

export const promptExpansionSettingsStore = createStore<ExpansionSettings>(
  "promptExpansionSettings",
  ExpansionSettingsSchema,
  { seedText: "", siteUrl: "", count: DEFAULT_COUNT },
);

/** 新しい結果を先頭に積む（古いものから捨てる） */
export function saveExpansion(result: ExpansionResult, projectId: string): StoredExpansion {
  const stored: StoredExpansion = { id: newId(), projectId, result };
  promptExpansionsStore.update((prev) => [stored, ...prev].slice(0, MAX_EXPANSIONS));
  return stored;
}

export function removeExpansion(id: string): void {
  promptExpansionsStore.update((prev) => prev.filter((e) => e.id !== id));
}

/** 参考プロンプトの入力欄（改行区切り）→ 配列 */
export function parseSeedText(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const v = line.trim();
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}
