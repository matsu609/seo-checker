/**
 * 前回の診断との差分（純関数）。
 *
 * カテゴリ別の件数差と、課題単位の「新規 / 継続 / 解消」を出す。
 * 課題の同一性は (ruleId, url) で見る（detail は件数を含むので変わりやすい）。
 */
import type { AuditCategory, CategoryCount, Issue, Severity } from "./types";

export type IssueChange = "new" | "kept" | "resolved" | "unchecked";

export const CHANGE_LABELS: Record<IssueChange, string> = {
  new: "新規",
  kept: "継続",
  resolved: "解消",
  unchecked: "未確認",
};

export interface DiffEntry {
  ruleId: string;
  url: string;
  category: AuditCategory;
  severity: Severity;
  change: IssueChange;
  /** 解消・未確認の課題は前回の detail、それ以外は今回の detail */
  detail: string;
}

export interface AuditDiff {
  entries: DiffEntry[];
  counts: Record<IssueChange, number>;
}

function keyOf(issue: Pick<Issue, "ruleId" | "url">): string {
  return `${issue.ruleId} ${issue.url}`;
}

/**
 * 今回と前回の課題一覧を突き合わせる。
 *
 * checkedUrls には「今回実際に診断した URL」（クロールできたページと
 * サイト単位のルールが使うオリジン）を渡す。上限ページ数を下げた・取得に
 * 失敗した・sitemap の順序が変わったなどで今回見ていない URL の課題を
 * 「解消」と言い切らないため、その場合は "unchecked"（未確認）に分ける。
 * 省略したときは全ての URL を診断済みとみなす（従来どおりの挙動）。
 */
export function diffIssues(
  current: readonly Issue[],
  previous: readonly Issue[],
  checkedUrls?: ReadonlySet<string> | null,
): AuditDiff {
  const prev = new Map(previous.map((i) => [keyOf(i), i]));
  const entries: DiffEntry[] = [];
  const counts: Record<IssueChange, number> = { new: 0, kept: 0, resolved: 0, unchecked: 0 };

  for (const issue of current) {
    const change: IssueChange = prev.has(keyOf(issue)) ? "kept" : "new";
    counts[change] += 1;
    entries.push({
      ruleId: issue.ruleId,
      url: issue.url,
      category: issue.category,
      severity: issue.severity,
      change,
      detail: issue.detail,
    });
  }

  const currentKeys = new Set(current.map(keyOf));
  for (const issue of previous) {
    if (currentKeys.has(keyOf(issue))) continue;
    // 今回そのページを見ていないなら、直ったのか残っているのか分からない
    const change: IssueChange = !checkedUrls || checkedUrls.has(issue.url) ? "resolved" : "unchecked";
    counts[change] += 1;
    entries.push({
      ruleId: issue.ruleId,
      url: issue.url,
      category: issue.category,
      severity: issue.severity,
      change,
      detail: issue.detail,
    });
  }

  return { entries, counts };
}

/** カテゴリ表に前回件数と増減を足す */
export function withCategoryDelta(
  current: readonly CategoryCount[],
  previous: readonly CategoryCount[] | null,
): CategoryCount[] {
  if (!previous) return current.map((c) => ({ ...c }));
  const prev = new Map(previous.map((c) => [c.category, c.count]));
  return current.map((c) => {
    const prevCount = prev.get(c.category);
    return prevCount === undefined ? { ...c } : { ...c, prevCount, delta: c.count - prevCount };
  });
}
