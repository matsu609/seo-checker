"use client";

/**
 * 診断サマリー。
 * ANTHROPIC_API_KEY が無い環境でも空欄にしないため、既定はルールから
 * 組み立てた文章を出し、キーがあるときだけ「AI で書き直す」ボタンを添える。
 */
import { Badge, Button, Callout, Card } from "@/components/ui";
import type { AuditSummary } from "@/lib/audit/types";

export function AuditSummaryCard({
  summary,
  aiEnabled,
  aiState,
  onGenerate,
}: {
  summary: AuditSummary;
  /** ANTHROPIC_API_KEY が設定されているか（未取得なら null） */
  aiEnabled: boolean | null;
  aiState: { loading: boolean; error: string | null };
  onGenerate: () => void;
}) {
  const isLlm = summary.source === "llm";
  return (
    <Card
      title="診断サマリー"
      description={
        isLlm
          ? "Claude が集計結果をもとに書いた要約です。数値の根拠は下のカテゴリ表と課題一覧で確認できます。"
          : "検出したルールの集計から自動生成した要約です（AI は使っていません）。"
      }
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={isLlm ? "info" : "neutral"} icon={false}>
            {isLlm ? "AI 生成" : "ルール生成"}
          </Badge>
          {aiEnabled && (
            <Button variant="secondary" size="sm" loading={aiState.loading} onClick={onGenerate}>
              {isLlm ? "AI で書き直す" : "AI で要約する"}
            </Button>
          )}
        </div>
      }
    >
      {aiEnabled === false && (
        <p className="mb-4 rounded-sm border border-line bg-surface p-3 text-[12px] leading-relaxed text-muted">
          文章での総評を AI に書かせるには <code className="font-mono">ANTHROPIC_API_KEY</code> の設定が必要です。
          未設定のため、ルールの集計から組み立てた要約を表示しています。
        </p>
      )}
      {aiState.error && (
        <Callout tone="warn" className="mb-4">
          {aiState.error}
        </Callout>
      )}

      <p className="text-sm leading-relaxed text-ink">{summary.overall}</p>

      <div className="mt-5 grid gap-5 @3xl:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-bold text-ink">技術的な健全性</h3>
          <ul className="space-y-1.5 text-[13px] leading-relaxed text-ink">
            {summary.technicalHealth.map((line) => (
              <li key={line} className="border-l-2 border-line pl-3">
                {line}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-bold text-ink">コンテンツの問題点</h3>
          <ul className="space-y-1.5 text-[13px] leading-relaxed text-ink">
            {summary.contentIssues.map((line) => (
              <li key={line} className="border-l-2 border-line pl-3">
                {line}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {summary.priorityActions.length > 0 && (
        <div className="mt-6 border-t border-line pt-4">
          <h3 className="mb-2 text-sm font-bold text-ink">優先対応</h3>
          <ol className="space-y-3">
            {summary.priorityActions.map((action, index) => (
              <li key={action.title} className="grid grid-cols-[1.5rem_1fr] gap-2">
                <span className="text-sm font-bold tabular-nums text-accent">{index + 1}.</span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-ink">{action.title}</p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{action.why}</p>
                  {action.rules.length > 0 && (
                    <p className="mt-1 flex flex-wrap gap-1">
                      {action.rules.map((rule) => (
                        <Badge key={rule} tone="id">
                          {rule}
                        </Badge>
                      ))}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </Card>
  );
}
