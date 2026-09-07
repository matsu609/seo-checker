/**
 * キーワード調査（C1）のブラウザ側ストア（localStorage + zod）。
 * 入力条件と直近の調査結果を残し、リロードしても作業が消えないようにする。
 */
import { z } from "zod";
import { createStore, newId } from "@/lib/store";
import type { KeywordsResponse } from "./types";

/** 残す調査履歴の件数（1 件あたり最大 600 行なので少なめ） */
export const MAX_RESEARCH_HISTORY = 10;

export const SuggestGroupSchema = z.enum(["kana", "alpha", "digit"]);

export const KeywordSettingsSchema = z.object({
  seed: z.string(),
  groups: z.array(SuggestGroupSchema),
  useRelated: z.boolean(),
  useLlmIntent: z.boolean(),
});

export type KeywordSettings = z.infer<typeof KeywordSettingsSchema>;

const KeywordRowSchema = z.object({
  keyword: z.string(),
  chars: z.number(),
  sources: z.array(z.enum(["suggest", "related", "paa"])),
  intent: z.enum(["informational", "navigational", "transactional", "commercial"]).nullable(),
  judge: z.enum(["rule", "llm", "unknown"]),
  matched: z.string().optional(),
});

const KeywordsResponseSchema = z.object({
  seed: z.string(),
  rows: z.array(KeywordRowSchema),
  suggest: z.object({ queries: z.number(), succeeded: z.number(), keywords: z.number() }),
  related: z.object({
    enabled: z.boolean(),
    relatedSearches: z.number(),
    relatedQuestions: z.number(),
  }),
  intent: z.object({
    llmEnabled: z.boolean(),
    ruleCount: z.number(),
    llmCount: z.number(),
    unknownCount: z.number(),
  }),
  notes: z.array(
    z.object({
      kind: z.enum(["suggest_partial", "related_skipped", "intent_skipped", "capped"]),
      message: z.string(),
    }),
  ),
  fetchedAt: z.string(),
});

export const KeywordResearchSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  result: KeywordsResponseSchema,
});

export type KeywordResearch = z.infer<typeof KeywordResearchSchema>;

export const keywordSettingsStore = createStore<KeywordSettings>(
  "keywordSettings",
  KeywordSettingsSchema,
  { seed: "", groups: ["kana", "alpha"], useRelated: true, useLlmIntent: true },
);

export const keywordResearchStore = createStore<KeywordResearch[]>(
  "keywordResearch",
  z.array(KeywordResearchSchema),
  [],
);

/** 調査結果を保存する（新しい順、上限を超えた分は捨てる） */
export function saveResearch(result: KeywordsResponse, projectId: string): KeywordResearch {
  const entry: KeywordResearch = { id: newId(), projectId, result };
  keywordResearchStore.update((prev) => [entry, ...prev].slice(0, MAX_RESEARCH_HISTORY));
  return entry;
}

export function removeResearch(id: string): void {
  keywordResearchStore.update((prev) => prev.filter((r) => r.id !== id));
}
