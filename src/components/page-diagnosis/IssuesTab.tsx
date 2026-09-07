"use client";

import { Card, EmptyState } from "@/components/ui";
import type { StoredDiagnosis } from "@/lib/page-diagnosis/store";
import { CopyButton } from "./CopyButton";

/** 全角換算の文字数（title / description の長さの目安） */
function fullWidth(text: string): number {
  let w = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    w += code > 0x2e7f ? 2 : 1;
  }
  return Math.ceil(w / 2);
}

function Suggestion({ text, hint }: { text: string; hint: string }) {
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 rounded-sm border border-line bg-surface p-3">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-relaxed text-ink">{text}</p>
        <p className="mt-1 text-[11px] text-muted">
          全角換算 {fullWidth(text)} 文字（{hint}）
        </p>
      </div>
      <CopyButton text={text} />
    </li>
  );
}

/** 課題分析タブ: 総評・title / description 案・技術的な課題 */
export function IssuesTab({ diagnosis }: { diagnosis: StoredDiagnosis }) {
  const analysis = diagnosis.analysis;
  if (!analysis) {
    return (
      <EmptyState
        title="AI による課題分析は行われていません"
        description="title / description 案と課題の抽出には ANTHROPIC_API_KEY が必要です。サーバーに設定して、もう一度診断を実行してください。"
      />
    );
  }

  return (
    <div className="space-y-6">
      <Card title="総評">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{analysis.summary}</p>
        {diagnosis.self && (
          <dl className="mt-4 grid gap-3 border-t border-line pt-4 text-[13px] sm:grid-cols-2">
            <div>
              <dt className="font-bold text-ink">現在の title</dt>
              <dd className="mt-0.5 text-muted">{diagnosis.self.title ?? "（設定されていません）"}</dd>
            </div>
            <div>
              <dt className="font-bold text-ink">現在の meta description</dt>
              <dd className="mt-0.5 text-muted">{diagnosis.self.description ?? "（設定されていません）"}</dd>
            </div>
          </dl>
        )}
      </Card>

      <Card title="title 案" description="全角 30 文字前後が目安です。そのままコピーして使えます。">
        {analysis.title_suggestions.length > 0 ? (
          <ul className="space-y-2">
            {analysis.title_suggestions.map((t) => (
              <Suggestion key={t} text={t} hint="目安 30 文字前後" />
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-muted">title 案は生成されませんでした。</p>
        )}
      </Card>

      <Card title="meta description 案" description="全角 60〜120 文字が目安です。">
        {analysis.description_suggestions.length > 0 ? (
          <ul className="space-y-2">
            {analysis.description_suggestions.map((d) => (
              <Suggestion key={d} text={d} hint="目安 60〜120 文字" />
            ))}
          </ul>
        ) : (
          <p className="text-[13px] text-muted">meta description 案は生成されませんでした。</p>
        )}
      </Card>

      <Card title="技術的・構成上の課題" description="対象ページの測定値と上位ページの差から抽出した課題です。">
        {analysis.technical_issues.length > 0 ? (
          <ol className="space-y-3">
            {analysis.technical_issues.map((issue, i) => (
              <li key={`${issue.issue}:${i}`} className="rounded-sm border border-line bg-surface p-3">
                <p className="text-[13px] font-bold text-ink">{issue.issue}</p>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">{issue.fix}</p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-[13px] text-muted">大きな課題は検出されませんでした。</p>
        )}
      </Card>
    </div>
  );
}
