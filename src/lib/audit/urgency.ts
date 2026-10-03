/**
 * サイト診断（50 ルール）の「対応の優先度」と「まず、これをしてください」。純関数。
 *
 * 無料診断（src/lib/report/urgency.ts）と同じ 3 段階を、点数の無いサイト診断に当てはめる:
 * - now   … 急ぎで対応: 検索や AI 検索に「載らない・読まれない」原因になるルール
 *           （AUDIT_BLOCKING）。意図した除外（severity = info）は除く
 * - later … 後回しで OK: 重要度 info（把握しておけばよい）
 * - soon  … 要改善: 残り（重要度 error / warning）
 *
 * 利用者の指示 2026-10-03「精密診断にも同じ仕組みを入れてください」。
 */
import { buildActionPlan, type ActionItem, type ActionPlan } from "@/lib/report/action-plan";
import { urgencyIndex, type Urgency } from "@/lib/report/urgency";
import { SEVERITY_LABELS, type Issue, type Severity } from "./types";

/** 「載らない・読まれない」原因になるルール（意図した除外 = info のときは急ぎにしない） */
export const AUDIT_BLOCKING: ReadonlySet<string> = new Set([
  // たどり着けない
  "STATUS_5XX",
  "STATUS_4XX",
  // クロール・索引から外れる
  "ROBOTS_BLOCKED",
  "NOINDEX",
  "AI_CRAWLER_BLOCKED",
  // 正規 URL が壊れていて評価先が無い
  "CANONICAL_LOOP",
  "CANONICAL_BROKEN",
  // 検索結果・AI の引用に見出しが出ない
  "TITLE_MISSING",
]);

/** 重要度の重さ（並べ替え用） */
const SEVERITY_RANK: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

export function auditUrgency(ruleId: string, severity: Severity): Urgency {
  if (severity === "info") return "later";
  if (AUDIT_BLOCKING.has(ruleId)) return "now";
  return "soon";
}

export interface AuditActionItem extends ActionItem {
  ruleId: string;
  severity: Severity;
  count: number;
}

/**
 * ルールごとに 1 件の改善項目にまとめる。
 * 並びは 急ぎ → 要改善 → 放置 OK、同じ段なら重要度（重大 → 警告 → 情報）→ 件数の多い順 → ルール ID。
 * 項目名と対応方法は、そのルールの最初の課題の文（detail / suggestion）をそのまま使う。
 */
export function buildAuditActionItems(issues: readonly Issue[]): AuditActionItem[] {
  const groups = new Map<string, { first: Issue; count: number; severity: Severity }>();
  for (const issue of issues) {
    const found = groups.get(issue.ruleId);
    if (found) {
      found.count += 1;
      // 同じルールで重要度が混ざる（意図した除外とそうでないもの）ときは重いほうを採る
      if (SEVERITY_RANK[issue.severity] < SEVERITY_RANK[found.severity]) {
        found.severity = issue.severity;
        found.first = issue;
      }
    } else {
      groups.set(issue.ruleId, { first: issue, count: 1, severity: issue.severity });
    }
  }
  const items: AuditActionItem[] = [...groups.entries()].map(([ruleId, g]) => ({
    id: ruleId,
    ruleId,
    severity: g.severity,
    count: g.count,
    label: g.first.detail,
    categoryLabel: `${g.first.category}・${SEVERITY_LABELS[g.severity]}`,
    gainLabel: `${g.count.toLocaleString("ja-JP")} 件`,
    urgency: auditUrgency(ruleId, g.severity),
    advice: g.first.suggestion,
  }));
  return items.sort(
    (a, b) =>
      urgencyIndex(a.urgency) - urgencyIndex(b.urgency) ||
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      b.count - a.count ||
      a.ruleId.localeCompare(b.ruleId),
  );
}

/** サイト診断の「まず、これをしてください」。点数が無いので水準の文は出さず、診断の規模を 1 文で添える */
export function buildAuditActionPlan(input: { issues: readonly Issue[]; analyzedPages: number }): ActionPlan {
  const items = buildAuditActionItems(input.issues);
  const pages = input.analyzedPages.toLocaleString("ja-JP");
  const intro = `${pages} ページを診断し、課題は ${input.issues.length.toLocaleString("ja-JP")} 件（${items.length.toLocaleString("ja-JP")} 種類）でした。`;
  return buildActionPlan({ items, overall: null, grade: null, subject: "このサイト", intro, effectHeading: "該当" });
}
