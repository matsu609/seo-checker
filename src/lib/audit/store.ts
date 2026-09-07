"use client";

/**
 * サイト診断の履歴（ブラウザの localStorage）。
 *
 * オリジンごとに直近 HISTORY_LIMIT 件を残し、「前回との差分」に使う。
 * 結果そのものは 1 件で数百 KB になるため、履歴には集計と課題一覧だけを
 * 保存し、ページ一覧（pages）は捨てる。共有の createStore を通すので
 * 壊れた値は初期値に戻る。
 */

import { z } from "zod";
import { createStore } from "@/lib/store/createStore";
import { HISTORY_LIMIT } from "./config";
import type { AuditResult } from "./types";
import { AUDIT_CATEGORIES } from "./types";

const CategorySchema = z.enum(AUDIT_CATEGORIES);
const SeveritySchema = z.enum(["error", "warning", "info"]);

const IssueSchema = z.object({
  ruleId: z.string(),
  category: CategorySchema,
  severity: SeveritySchema,
  url: z.string(),
  detail: z.string(),
  suggestion: z.string(),
});

const SnapshotSchema = z.object({
  id: z.string(),
  origin: z.string(),
  startUrl: z.string(),
  crawledAt: z.string(),
  analyzed: z.number(),
  issueCount: z.number(),
  bySeverity: z.object({ error: z.number(), warning: z.number(), info: z.number() }),
  byCategory: z.array(z.object({ category: CategorySchema, count: z.number() })),
  issues: z.array(IssueSchema),
});

export type AuditSnapshot = z.infer<typeof SnapshotSchema>;

const HistorySchema = z.array(SnapshotSchema);

export type AuditHistory = z.infer<typeof HistorySchema>;

/** 履歴（新しい順）。オリジンをまたいで 1 本の配列に入れる */
export const auditHistoryStore = createStore<AuditHistory>("auditHistory", HistorySchema, []);

const FormSchema = z.object({
  url: z.string(),
  maxPages: z.number().int().positive(),
});

export type AuditForm = z.infer<typeof FormSchema>;

/** 入力内容。リロードしても診断対象を打ち直さずに済むように保存する */
export const auditFormStore = createStore<AuditForm>("auditForm", FormSchema, {
  url: "",
  maxPages: 100,
});

/** 結果を履歴に残す形にする（ページ一覧は落とす） */
export function toSnapshot(result: AuditResult): AuditSnapshot {
  return {
    id: `${result.origin}|${result.crawledAt}`,
    origin: result.origin,
    startUrl: result.startUrl,
    crawledAt: result.crawledAt,
    analyzed: result.crawl.analyzed,
    issueCount: result.issues.length,
    bySeverity: result.bySeverity,
    byCategory: result.byCategory.map((c) => ({ category: c.category, count: c.count })),
    issues: result.issues,
  };
}

/** 同じ origin の履歴だけを新しい順で返す */
export function historyFor(history: AuditHistory, origin: string): AuditSnapshot[] {
  return history
    .filter((s) => s.origin === origin)
    .sort((a, b) => b.crawledAt.localeCompare(a.crawledAt));
}

/**
 * 履歴に 1 件足す（同じ id は置き換え）。オリジンごとに limit 件だけ残す。
 * 純関数にしてあるのでテストから直接呼べる。
 */
export function appendSnapshot(
  history: AuditHistory,
  snapshot: AuditSnapshot,
  limit = HISTORY_LIMIT,
): AuditHistory {
  const without = history.filter((s) => s.id !== snapshot.id);
  const sameOrigin = [snapshot, ...without.filter((s) => s.origin === snapshot.origin)]
    .sort((a, b) => b.crawledAt.localeCompare(a.crawledAt))
    .slice(0, limit);
  const others = without.filter((s) => s.origin !== snapshot.origin);
  return [...sameOrigin, ...others];
}

/** 保存して、同じオリジンの「前回」を返す */
export function saveRun(result: AuditResult): AuditSnapshot | null {
  const snapshot = toSnapshot(result);
  const before = historyFor(auditHistoryStore.get(), result.origin).filter((s) => s.id !== snapshot.id);
  auditHistoryStore.update((prev) => appendSnapshot(prev, snapshot));
  return before[0] ?? null;
}
