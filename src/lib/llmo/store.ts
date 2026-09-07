/**
 * LLMO モニタリングのブラウザ側ストア（localStorage + zod）。
 *
 * サーバーは状態を持たないので、登録プロンプト・実行履歴・リサーチのメタ情報は
 * すべてここ。API キーが無い環境でも「プロンプトの登録だけ先に済ませる」ことが
 * できるよう、実行とは独立して読み書きできる。
 */
import { z } from "zod";
import { createStore, newId } from "@/lib/store";
import { PROVIDER_IDS } from "./providers/meta";
import type { LlmoRun, LlmoRunRow } from "./types";

/** 保存する実行結果の上限（localStorage の容量を守る。古いものから捨てる） */
export const MAX_RUNS = 1_000;
/** 1 件あたりに保存する回答本文の長さ */
export const MAX_STORED_ANSWER = 4_000;

const ProviderIdSchema = z.enum(PROVIDER_IDS);

export const LlmoPromptSchema = z.object({
  id: z.string().min(1),
  /** プロジェクト未選択のときは "" */
  projectId: z.string(),
  text: z.string(),
  /** プロンプト拡張から登録したときのカテゴリ */
  category: z.string().optional(),
  active: z.boolean(),
  createdAt: z.string(),
});

export type LlmoPrompt = z.infer<typeof LlmoPromptSchema>;

const CitationSchema = z.object({ url: z.string(), title: z.string().nullable() });

const JudgementSchema = z.object({
  entityId: z.string(),
  brandMentioned: z.boolean(),
  domainCited: z.boolean(),
  matchedDomains: z.array(z.string()),
  matchedAliases: z.array(z.string()),
});

const UnclassifiedSchema = z.object({
  domain: z.string(),
  count: z.number(),
  sampleUrl: z.string(),
  sampleTitle: z.string().nullable(),
});

export const LlmoRunSchema = z.object({
  id: z.string().min(1),
  projectId: z.string(),
  takenOn: z.string(),
  measuredAt: z.string(),
  promptId: z.string(),
  promptText: z.string(),
  providerId: ProviderIdSchema,
  model: z.string(),
  status: z.enum(["ok", "error"]),
  error: z.string().optional(),
  answer: z.string(),
  citations: z.array(CitationSchema),
  searchQueries: z.array(z.string()),
  fanoutSupported: z.boolean(),
  judgements: z.array(JudgementSchema),
  unclassified: z.array(UnclassifiedSchema),
  researchId: z.string().optional(),
});

export const LlmoResearchSchema = z.object({
  id: z.string().min(1),
  projectId: z.string(),
  name: z.string(),
  promptText: z.string(),
  models: z.array(ProviderIdSchema),
  /** 調査対象テキスト（ブランド表記）と調査対象サイト。行列の見出しに使う */
  targetTexts: z.array(z.string()),
  targetSites: z.array(z.string()),
  createdAt: z.string(),
});

export type LlmoResearch = z.infer<typeof LlmoResearchSchema>;

export const LlmoSettingsSchema = z.object({
  /** 実行対象のモデル */
  models: z.array(ProviderIdSchema),
  /** 単発リサーチの入力 */
  researchName: z.string(),
  researchPrompt: z.string(),
  researchTargetText: z.string(),
  researchTargetSite: z.string(),
});

export type LlmoSettings = z.infer<typeof LlmoSettingsSchema>;

export const llmoPromptsStore = createStore<LlmoPrompt[]>("llmoPrompts", z.array(LlmoPromptSchema), []);
export const llmoRunsStore = createStore<LlmoRun[]>("llmoRuns", z.array(LlmoRunSchema), []);
export const llmoResearchStore = createStore<LlmoResearch[]>("llmoResearch", z.array(LlmoResearchSchema), []);
export const llmoSettingsStore = createStore<LlmoSettings>("llmoSettings", LlmoSettingsSchema, {
  models: ["claude"],
  researchName: "",
  researchPrompt: "",
  researchTargetText: "",
  researchTargetSite: "",
});

/* ───────────── プロンプト ───────────── */

/** 同じプロジェクトに同じ本文があれば追加しない。追加した分だけ返す */
export function addPrompts(
  texts: readonly string[],
  options: { projectId: string; category?: string },
  now = new Date(),
): LlmoPrompt[] {
  const existing = new Set(
    llmoPromptsStore
      .get()
      .filter((p) => p.projectId === options.projectId)
      .map((p) => p.text.trim()),
  );
  const created: LlmoPrompt[] = [];
  for (const raw of texts) {
    const text = raw.trim();
    if (!text || existing.has(text)) continue;
    existing.add(text);
    created.push({
      id: newId(),
      projectId: options.projectId,
      text,
      ...(options.category ? { category: options.category } : {}),
      active: true,
      createdAt: now.toISOString(),
    });
  }
  if (created.length > 0) llmoPromptsStore.update((prev) => [...prev, ...created]);
  return created;
}

export function removePrompt(id: string): void {
  llmoPromptsStore.update((prev) => prev.filter((p) => p.id !== id));
}

export function togglePrompt(id: string, active: boolean): void {
  llmoPromptsStore.update((prev) => prev.map((p) => (p.id === id ? { ...p, active } : p)));
}

/** プロジェクトの登録プロンプト（登録順） */
export function promptsForProject(prompts: readonly LlmoPrompt[], projectId: string): LlmoPrompt[] {
  return prompts.filter((p) => p.projectId === projectId);
}

/* ───────────── 実行結果 ───────────── */

/** API の 1 行 → 保存する 1 行 */
export function toStoredRun(
  row: LlmoRunRow,
  meta: { projectId: string; takenOn: string; measuredAt: string; researchId?: string },
): LlmoRun {
  return {
    id: newId(),
    projectId: meta.projectId,
    takenOn: meta.takenOn,
    measuredAt: meta.measuredAt,
    promptId: row.promptId,
    promptText: row.promptText,
    providerId: row.providerId,
    model: row.model,
    status: row.status,
    ...(row.error ? { error: row.error } : {}),
    answer: row.answer.slice(0, MAX_STORED_ANSWER),
    citations: row.citations,
    searchQueries: row.searchQueries,
    fanoutSupported: row.fanoutSupported,
    judgements: row.judgements,
    unclassified: row.unclassified,
    ...(meta.researchId ? { researchId: meta.researchId } : {}),
  };
}

/**
 * 追加保存する。同じ日・同じプロンプト・同じモデルの定点モニタリング結果は
 * 後勝ちで置き換える（1 日に 2 回実行しても二重に数えない）。リサーチは常に追加。
 */
export function saveRuns(runs: readonly LlmoRun[]): void {
  if (runs.length === 0) return;
  llmoRunsStore.update((prev) => {
    const replaced = new Set(
      runs
        .filter((r) => !r.researchId)
        .map((r) => `${r.projectId}|${r.takenOn}|${r.promptId}|${r.providerId}`),
    );
    const kept = prev.filter(
      (r) => r.researchId || !replaced.has(`${r.projectId}|${r.takenOn}|${r.promptId}|${r.providerId}`),
    );
    return [...kept, ...runs].slice(-MAX_RUNS);
  });
}

/** 定点モニタリングの結果（リサーチを除く） */
export function monitorRuns(runs: readonly LlmoRun[], projectId: string): LlmoRun[] {
  return runs.filter((r) => r.projectId === projectId && !r.researchId);
}

/** 1 回のリサーチの結果 */
export function researchRuns(runs: readonly LlmoRun[], researchId: string): LlmoRun[] {
  return runs.filter((r) => r.researchId === researchId);
}

export function removeResearch(researchId: string): void {
  llmoRunsStore.update((prev) => prev.filter((r) => r.researchId !== researchId));
  llmoResearchStore.update((prev) => prev.filter((r) => r.id !== researchId));
}

/** プロジェクトの履歴をまとめて消す（定点モニタリングのみ） */
export function clearMonitorRuns(projectId: string): void {
  llmoRunsStore.update((prev) => prev.filter((r) => !(r.projectId === projectId && !r.researchId)));
}

/* ───────────── リサーチ ───────────── */

/** 既定の名前「YYYYMMDD LLM リサーチ」 */
export function defaultResearchName(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}${m}${d} LLM リサーチ`;
}

export function addResearch(input: Omit<LlmoResearch, "id" | "createdAt">, now = new Date()): LlmoResearch {
  const research: LlmoResearch = { ...input, id: newId(), createdAt: now.toISOString() };
  llmoResearchStore.update((prev) => [...prev, research]);
  return research;
}
