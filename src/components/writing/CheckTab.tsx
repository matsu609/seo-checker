"use client";

/**
 * 記事チェック（D4）: ファクトチェック / コピペチェック / 薬機法チェック。
 *
 * 薬機法チェックは NG 表現辞書（正規表現）だけでも動くので、
 * ANTHROPIC_API_KEY が無い環境でも実行できる（AI の文脈判定だけが省かれる）。
 * 指摘をクリックすると、エディターの該当箇所を選択して表示する。
 */
import { useState } from "react";
import { Badge, Button, Callout, Card, EmptyState } from "@/components/ui";
import type { CheckIssue, CheckKind, CheckResult } from "@/lib/writing/types";
import type { Draft } from "@/lib/writing/store";
import { useToolRun } from "@/lib/tools/run";

interface CheckResponse {
  result: CheckResult;
}

const CHECKS: ReadonlyArray<{
  kind: CheckKind;
  label: string;
  description: string;
  /** ANTHROPIC_API_KEY が必要か */
  requiresLlm: boolean;
}> = [
  {
    kind: "fact",
    label: "ファクトチェック",
    description: "本文から検証できる主張を抜き出し、Web 検索で「裏付けあり / 矛盾 / 不明」を判定します。",
    requiresLlm: true,
  },
  {
    kind: "copy",
    label: "コピペチェック",
    description: "本文から 40〜60 文字の文を抜き出し、完全一致検索で同じ文を載せたページを探します。",
    requiresLlm: true,
  },
  {
    kind: "yakki",
    label: "薬機法チェック",
    description: "NG 表現の辞書で走査します（AI があるときは文脈を見て誤検知を除きます）。",
    requiresLlm: false,
  },
];

const TONE: Record<CheckIssue["severity"], "pass" | "warn" | "fail" | "info"> = {
  pass: "pass",
  warn: "warn",
  fail: "fail",
  info: "info",
};

export interface CheckTabProps {
  draft: Draft | null;
  anthropicEnabled: boolean;
  /** 指摘をクリックしたとき、エディターで該当箇所を選択する */
  onFocusIssue: (start: number, length: number) => void;
}

export function CheckTab({ draft, anthropicEnabled, onFocusIssue }: CheckTabProps) {
  const [results, setResults] = useState<Partial<Record<CheckKind, CheckResult>>>({});
  const [runningKind, setRunningKind] = useState<CheckKind | null>(null);
  const run = useToolRun<CheckResponse>();

  async function execute(kind: CheckKind) {
    if (!draft || !draft.markdown.trim()) return;
    setRunningKind(kind);
    const data = await run.run("/api/writing/check", { kind, markdown: draft.markdown });
    setRunningKind(null);
    if (!data) return;
    setResults((prev) => ({ ...prev, [kind]: data.result }));
  }

  if (!draft) {
    return (
      <EmptyState
        title="チェックする記事がありません"
        description="先に一発生成タブで記事を作るか、エディタータブで下書きを作成してください。"
      />
    );
  }

  const busy = run.state.phase === "running";

  return (
    <div className="space-y-6">
      <Card
        title="チェックする"
        description={`「${draft.title}」（${draft.markdown.length.toLocaleString("ja-JP")} 文字）を対象にします。判定は目安です。最終確認は必ず人が行ってください。`}
      >
        <div className="grid gap-3 @2xl:grid-cols-3">
          {CHECKS.map((check) => {
            const disabled = busy || (check.requiresLlm && !anthropicEnabled) || draft.markdown.trim().length === 0;
            return (
              <div key={check.kind} className="rounded-sm border border-line bg-surface p-3">
                <p className="text-[13px] font-bold text-ink">{check.label}</p>
                <p className="mt-1 text-[12px] leading-relaxed text-muted">{check.description}</p>
                {check.requiresLlm && !anthropicEnabled && (
                  <p className="mt-1 text-[12px] text-warn">ANTHROPIC_API_KEY が必要です。</p>
                )}
                <Button
                  className="mt-3"
                  size="sm"
                  loading={runningKind === check.kind}
                  disabled={disabled}
                  onClick={() => void execute(check.kind)}
                >
                  実行
                </Button>
              </div>
            );
          })}
        </div>

        {busy && (
          <div className="mt-4 flex items-center gap-3">
            <p className="text-[12px] text-muted">
              チェック中です。Web 検索を伴うチェックは 1 分ほどかかることがあります。
            </p>
            <Button variant="secondary" size="sm" onClick={run.cancel}>
              中止
            </Button>
          </div>
        )}

        {run.state.phase === "error" && (
          <Callout tone="fail" className="mt-4">
            {run.state.message}
          </Callout>
        )}
      </Card>

      {CHECKS.map((check) => {
        const result = results[check.kind];
        if (!result) return null;
        return (
          <Card
            key={check.kind}
            title={`${check.label}の結果`}
            description={`${result.checked} 件を確認し、${result.issues.length} 件を表示しています。${
              result.model ? `（モデル: ${result.model}）` : "（AI は使用していません）"
            }`}
          >
            {result.notes.length > 0 && (
              <Callout tone="info" className="mb-4">
                <ul className="list-disc space-y-1 pl-5">
                  {result.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </Callout>
            )}

            {result.issues.length === 0 ? (
              <p className="text-[13px] text-muted">指摘はありませんでした。</p>
            ) : (
              <ul className="space-y-3">
                {result.issues.map((issue) => (
                  <li key={issue.id} className="rounded-sm border border-line bg-surface p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={TONE[issue.severity]}>{issue.verdict}</Badge>
                      {issue.start !== null ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onFocusIssue(issue.start as number, issue.text.length)}
                        >
                          エディターで該当箇所を開く
                        </Button>
                      ) : (
                        <span className="text-[12px] text-muted">本文中の位置を特定できませんでした</span>
                      )}
                    </div>
                    <p className="mt-2 text-[13px] font-bold text-ink">「{issue.text}」</p>
                    <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{issue.message}</p>
                    {issue.suggestion && (
                      <p className="mt-1 text-[13px] leading-relaxed text-accent">言い換え候補: {issue.suggestion}</p>
                    )}
                    {issue.sources.length > 0 && (
                      <ul className="mt-2 space-y-1 text-[12px]">
                        {issue.sources.map((s) => (
                          <li key={s.url}>
                            <a
                              href={s.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="break-all text-accent underline-offset-2 hover:underline"
                            >
                              {s.title ?? s.url}
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        );
      })}
    </div>
  );
}
