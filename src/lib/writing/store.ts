/**
 * AI ライティングのブラウザ側ストア（localStorage + zod）。
 *
 * 下書き（Markdown）・構成案・企画書・バージョン履歴をここに置く。
 * サーバーは状態を持たないので、生成した記事はすべてこのブラウザにだけ残る。
 */
import { z } from "zod";
import { createStore, newId } from "@/lib/store";
import type { ArticleOutline, ArticlePlan, WritingTone } from "./types";

/** 保存する下書きの数（古いものから捨てる） */
export const MAX_DRAFTS = 20;
/** 1 下書きあたりのバージョン履歴 */
export const MAX_VERSIONS = 30;

const OutlineSectionSchema = z.object({
  h2: z.string(),
  h3: z.array(z.string()),
  goal: z.string(),
  target_chars: z.number(),
});

export const StoredOutlineSchema = z.object({
  search_intent: z.string(),
  audience: z.string(),
  common_topics: z.array(z.string()),
  missing_topics: z.array(z.string()),
  title_suggestions: z.array(z.string()),
  description_suggestions: z.array(z.string()),
  outline: z.array(OutlineSectionSchema),
});

export const StoredPlanSchema = z.object({
  title_suggestions: z.array(z.string()),
  audience: z.string(),
  purpose: z.string(),
  target_keywords: z.array(z.string()),
  outline: z.array(z.object({ h2: z.string(), h3: z.array(z.string()), points: z.string() })),
  references: z.array(z.string()),
  cautions: z.array(z.string()),
});

export const DraftVersionSchema = z.object({
  id: z.string(),
  /** 何をしたときの版か（「初回生成」「校正」など） */
  label: z.string(),
  markdown: z.string(),
  createdAt: z.string(),
});

export const DraftSchema = z.object({
  id: z.string(),
  title: z.string(),
  keyword: z.string(),
  tone: z.enum(["desu", "dearu"]),
  markdown: z.string(),
  outline: StoredOutlineSchema.nullable(),
  plan: StoredPlanSchema.nullable(),
  versions: z.array(DraftVersionSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Draft = z.infer<typeof DraftSchema>;
export type DraftVersion = z.infer<typeof DraftVersionSchema>;

export const draftsStore = createStore<Draft[]>("writingDrafts", z.array(DraftSchema), []);

export const WritingSettingsSchema = z.object({
  keyword: z.string(),
  memo: z.string(),
  tone: z.enum(["desu", "dearu"]),
  targetChars: z.number(),
  useSerp: z.boolean(),
  /** 企画書モードの入力 */
  planContent: z.string(),
  planUseWebSearch: z.boolean(),
});

export type WritingSettings = z.infer<typeof WritingSettingsSchema>;

export const writingSettingsStore = createStore<WritingSettings>("writingSettings", WritingSettingsSchema, {
  keyword: "",
  memo: "",
  tone: "desu",
  targetChars: 4_000,
  useSerp: true,
  planContent: "",
  planUseWebSearch: false,
});

/** 選択中の下書き（画面のタブ間で共有する） */
export const currentDraftIdStore = createStore<string | null>(
  "writingCurrentDraft",
  z.string().nullable(),
  null,
);

export interface NewDraftInput {
  title?: string;
  keyword?: string;
  tone?: WritingTone;
  markdown?: string;
  outline?: ArticleOutline | null;
  plan?: ArticlePlan | null;
}

/** 下書きを作る（純関数。保存は addDraft） */
export function buildDraft(input: NewDraftInput, now = new Date()): Draft {
  const iso = now.toISOString();
  const markdown = input.markdown ?? "";
  return {
    id: newId(),
    title: (input.title ?? "").trim() || (input.keyword ?? "").trim() || "無題の記事",
    keyword: (input.keyword ?? "").trim(),
    tone: input.tone ?? "desu",
    markdown,
    outline: input.outline ?? null,
    plan: input.plan ?? null,
    versions: markdown ? [{ id: newId(), label: "初回生成", markdown, createdAt: iso }] : [],
    createdAt: iso,
    updatedAt: iso,
  };
}

/** 新しい下書きを先頭に足し、上限で切る（純関数） */
export function mergeDraft(prev: readonly Draft[], draft: Draft): Draft[] {
  return [draft, ...prev.filter((d) => d.id !== draft.id)].slice(0, MAX_DRAFTS);
}

export function addDraft(input: NewDraftInput, now = new Date()): Draft {
  const draft = buildDraft(input, now);
  draftsStore.update((prev) => mergeDraft(prev, draft));
  currentDraftIdStore.set(draft.id);
  return draft;
}

/** 履歴を残さない更新（入力中の本文など） */
export function updateDraft(id: string, patch: Partial<Omit<Draft, "id" | "createdAt" | "versions">>, now = new Date()): void {
  draftsStore.update((prev) =>
    prev.map((d) => (d.id === id ? { ...d, ...patch, updatedAt: now.toISOString() } : d)),
  );
}

/** バージョンを 1 つ足す（純関数） */
export function pushVersion(draft: Draft, markdown: string, label: string, now = new Date()): Draft {
  const iso = now.toISOString();
  const version: DraftVersion = { id: newId(), label: label.trim() || "更新", markdown, createdAt: iso };
  return {
    ...draft,
    markdown,
    versions: [version, ...draft.versions].slice(0, MAX_VERSIONS),
    updatedAt: iso,
  };
}

/** 本文を更新し、履歴に 1 版残す */
export function saveVersion(id: string, markdown: string, label: string, now = new Date()): void {
  draftsStore.update((prev) => prev.map((d) => (d.id === id ? pushVersion(d, markdown, label, now) : d)));
}

/** 履歴から復元する（復元自体も 1 版として残す。純関数） */
export function restoreVersion(draft: Draft, versionId: string, now = new Date()): Draft {
  const version = draft.versions.find((v) => v.id === versionId);
  if (!version) return draft;
  return pushVersion(draft, version.markdown, `復元: ${version.label}`, now);
}

export function restoreDraftVersion(id: string, versionId: string, now = new Date()): void {
  draftsStore.update((prev) => prev.map((d) => (d.id === id ? restoreVersion(d, versionId, now) : d)));
}

export function removeDraft(id: string): void {
  draftsStore.update((prev) => prev.filter((d) => d.id !== id));
}

export function findDraft(list: readonly Draft[], id: string | null): Draft | null {
  if (!id) return null;
  return list.find((d) => d.id === id) ?? null;
}
