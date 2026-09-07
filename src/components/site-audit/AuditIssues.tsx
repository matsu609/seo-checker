"use client";

/**
 * 課題ブラウザ。
 * カテゴリ・重要度・状態（新規 / 継続 / 解消）で絞り込み、ルールごとにまとめて
 * 該当 URL を折りたたみで並べる。表示中の内容をそのまま CSV に出せる。
 */
import { useMemo, useState } from "react";
import { Badge, Button, Card, EmptyState, Field, Input, Select } from "@/components/ui";
import type { IssueChange } from "@/lib/audit/diff";
import { CHANGE_LABELS } from "@/lib/audit/diff";
import type { AuditCategory, Issue, Severity } from "@/lib/audit/types";
import { AUDIT_CATEGORIES, SEVERITY_LABELS } from "@/lib/audit/types";
import { csvFileName, downloadCsv, type CsvColumn } from "@/lib/export/csv";
import { hostOf, pathOf } from "@/lib/report";

const SEVERITY_TONE: Record<Severity, "fail" | "warn" | "info"> = {
  error: "fail",
  warning: "warn",
  info: "info",
};

/** 重要度の並び（重い順） */
const SEVERITY_ORDER: Severity[] = ["error", "warning", "info"];

export interface IssueRow extends Issue {
  change?: IssueChange;
}

interface RuleGroup {
  ruleId: string;
  category: AuditCategory;
  severity: Severity;
  rows: IssueRow[];
}

const CSV_COLUMNS: CsvColumn<IssueRow>[] = [
  { header: "カテゴリ", value: (r) => r.category },
  { header: "重要度", value: (r) => SEVERITY_LABELS[r.severity] },
  { header: "ルールID", value: (r) => r.ruleId },
  { header: "URL", value: (r) => r.url },
  { header: "内容", value: (r) => r.detail },
  { header: "改善提案", value: (r) => r.suggestion },
  { header: "前回との比較", value: (r) => (r.change ? CHANGE_LABELS[r.change] : "") },
];

export function AuditIssues({
  issues,
  origin,
  hasPrevious,
}: {
  issues: readonly IssueRow[];
  origin: string;
  hasPrevious: boolean;
}) {
  const [category, setCategory] = useState<AuditCategory | "">("");
  const [severity, setSeverity] = useState<Severity | "">("");
  const [change, setChange] = useState<IssueChange | "">("");
  const [keyword, setKeyword] = useState("");

  const filtered = useMemo(() => {
    const needle = keyword.trim().toLowerCase();
    return issues.filter((issue) => {
      if (category && issue.category !== category) return false;
      if (severity && issue.severity !== severity) return false;
      if (change && issue.change !== change) return false;
      if (!needle) return true;
      return (
        issue.ruleId.toLowerCase().includes(needle) ||
        issue.url.toLowerCase().includes(needle) ||
        issue.detail.toLowerCase().includes(needle)
      );
    });
  }, [issues, category, severity, change, keyword]);

  const groups = useMemo(() => groupByRule(filtered), [filtered]);

  return (
    <Card
      title="検出された課題"
      description="ルールごとにまとめています。行を開くと該当ページの一覧と改善提案が出ます。"
      actions={
        <Button
          variant="secondary"
          size="sm"
          disabled={filtered.length === 0}
          onClick={() =>
            downloadCsv(csvFileName(`site-audit_${hostOf(origin)}`, new Date()), CSV_COLUMNS, filtered)
          }
        >
          CSV をダウンロード（{filtered.length} 件）
        </Button>
      }
    >
      <div className="mb-4 grid gap-3 @2xl:grid-cols-4">
        <Field label="カテゴリ" htmlFor="audit-filter-category">
          <Select
            id="audit-filter-category"
            value={category}
            onChange={(e) => setCategory(e.target.value as AuditCategory | "")}
          >
            <option value="">すべて</option>
            {AUDIT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="重要度" htmlFor="audit-filter-severity">
          <Select
            id="audit-filter-severity"
            value={severity}
            onChange={(e) => setSeverity(e.target.value as Severity | "")}
          >
            <option value="">すべて</option>
            {SEVERITY_ORDER.map((s) => (
              <option key={s} value={s}>
                {SEVERITY_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="前回との比較"
          htmlFor="audit-filter-change"
          hint={hasPrevious ? undefined : "履歴が 1 回分しかないため使えません"}
        >
          <Select
            id="audit-filter-change"
            value={change}
            disabled={!hasPrevious}
            onChange={(e) => setChange(e.target.value as IssueChange | "")}
          >
            <option value="">すべて</option>
            <option value="new">新規</option>
            <option value="kept">継続</option>
            <option value="resolved">解消</option>
          </Select>
        </Field>
        <Field label="キーワード" htmlFor="audit-filter-keyword" hint="ルール ID・URL・内容から探します">
          <Input
            id="audit-filter-keyword"
            value={keyword}
            placeholder="TITLE_ / /blog/ など"
            onChange={(e) => setKeyword(e.target.value)}
          />
        </Field>
      </div>

      {groups.length === 0 ? (
        <EmptyState
          title="条件に合う課題はありません"
          description={
            issues.length === 0
              ? "検出された課題がありません。テクニカル SEO の主要な項目は満たしています。"
              : "絞り込み条件を変えてください。"
          }
        />
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {groups.map((group) => (
            <li key={group.ruleId}>
              <details className="group">
                <summary className="flex cursor-pointer flex-wrap items-center gap-2 py-3 outline-none focus-visible:ring-2 focus-visible:ring-accent/40">
                  <Badge tone={SEVERITY_TONE[group.severity]}>{SEVERITY_LABELS[group.severity]}</Badge>
                  <Badge tone="id">{group.ruleId}</Badge>
                  <span className="order-last min-w-0 basis-full text-[13px] text-ink @lg:order-none @lg:basis-0 @lg:flex-1">{group.rows[0].detail}</span>
                  <span className="text-[12px] text-muted">{group.category}</span>
                  <span className="text-[13px] font-bold tabular-nums text-ink">{group.rows.length} 件</span>
                  <span aria-hidden className="text-[10px] text-muted group-open:hidden">
                    ▼
                  </span>
                  <span aria-hidden className="hidden text-[10px] text-muted group-open:inline">
                    ▲
                  </span>
                </summary>
                <div className="pb-4 pl-1">
                  <p className="mb-3 border-l-2 border-accent pl-3 text-[13px] leading-relaxed text-ink">
                    {group.rows[0].suggestion}
                  </p>
                  <ul className="space-y-1.5">
                    {group.rows.map((row) => (
                      <li key={`${row.ruleId}|${row.url}`} className="text-[12px] leading-relaxed">
                        <a
                          href={row.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="break-all font-bold text-accent underline-offset-2 hover:underline"
                        >
                          {pathOf(row.url)}
                        </a>
                        {row.change && (
                          <span
                            className={`ml-2 ${
                              row.change === "new"
                                ? "text-fail"
                                : row.change === "resolved"
                                  ? "text-pass"
                                  : "text-muted"
                            }`}
                          >
                            {CHANGE_LABELS[row.change]}
                          </span>
                        )}
                        <span className="ml-2 break-all text-muted">{row.detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** ルール ID ごとにまとめ、重要度 → 件数の順に並べる */
export function groupByRule(issues: readonly IssueRow[]): RuleGroup[] {
  const map = new Map<string, RuleGroup>();
  for (const issue of issues) {
    const found = map.get(issue.ruleId);
    if (found) found.rows.push(issue);
    else
      map.set(issue.ruleId, {
        ruleId: issue.ruleId,
        category: issue.category,
        severity: issue.severity,
        rows: [issue],
      });
  }
  return [...map.values()].sort(
    (a, b) =>
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity) ||
      b.rows.length - a.rows.length ||
      a.ruleId.localeCompare(b.ruleId),
  );
}
