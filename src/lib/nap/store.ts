"use client";

/**
 * NAP チェックの履歴（ブラウザ側。user_stores にも写る）。
 *
 * 直近 10 回の結果を新しい順に持つ。前回との比較（直ったか）は画面で見比べる。
 * ページの本文は含めない（結果は媒体 × 4 項目の判定だけなので小さい）。
 */
import { z } from "zod";
import { createStore } from "@/lib/store/createStore";
import { NAP_FIELDS, type NapCheckResult } from "./types";

export const NAP_HISTORY_LIMIT = 10;

const FieldCheckSchema = z.object({
  field: z.enum(NAP_FIELDS),
  status: z.enum(["match", "mismatch", "missing", "skipped"]),
  expected: z.string(),
  found: z.string().nullable(),
  note: z.string().optional(),
});

const SourceKindSchema = z.enum(["site_jsonld", "site_page", "google_maps", "listing", "web"]);

const SourceSchema = z.object({
  kind: SourceKindSchema,
  label: z.string(),
  url: z.string().nullable(),
  fields: z.array(FieldCheckSchema),
  error: z.string().nullable(),
});

const IssueSchema = z.object({
  severity: z.enum(["fail", "warn"]),
  sourceKind: SourceKindSchema,
  source: z.string(),
  url: z.string().nullable(),
  field: z.enum(NAP_FIELDS).nullable(),
  title: z.string(),
  detail: z.string(),
  action: z.string(),
});

export const NapCheckResultSchema = z.object({
  input: z.object({ name: z.string(), address: z.string(), phone: z.string(), website: z.string() }),
  checkedAt: z.string(),
  sources: z.array(SourceSchema),
  issues: z.array(IssueSchema),
  summary: z.object({ sources: z.number(), match: z.number(), mismatch: z.number(), missing: z.number() }),
  jsonLdSuggestion: z.string().nullable(),
  notes: z.array(z.string()),
});

export interface NapHistoryItem {
  id: string;
  result: NapCheckResult;
}

const HistorySchema: z.ZodType<NapHistoryItem[]> = z.array(z.object({ id: z.string(), result: NapCheckResultSchema }));

export const napHistoryStore = createStore<NapHistoryItem[]>("napHistory", HistorySchema, []);

export function pushNapHistory(result: NapCheckResult): NapHistoryItem {
  const item: NapHistoryItem = { id: `${Date.parse(result.checkedAt) || Date.now()}-${Math.random().toString(36).slice(2, 8)}`, result };
  napHistoryStore.update((prev) => [item, ...prev].slice(0, NAP_HISTORY_LIMIT));
  return item;
}

export function removeNapHistory(id: string): void {
  napHistoryStore.update((prev) => prev.filter((x) => x.id !== id));
}
