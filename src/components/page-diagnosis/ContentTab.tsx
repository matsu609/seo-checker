"use client";

import { Card, EmptyState } from "@/components/ui";
import type { StoredDiagnosis } from "@/lib/page-diagnosis/store";
import { ChatPanel } from "./ChatPanel";
import { CopyButton } from "./CopyButton";

/** コンテンツ分析タブ: 追加を推奨する箇所 / 概要 / 理由の 3 点セット + AI チャット */
export function ContentTab({ diagnosis, chatEnabled }: { diagnosis: StoredDiagnosis; chatEnabled: boolean }) {
  const proposals = diagnosis.analysis?.content_proposals ?? [];

  return (
    <div className="space-y-6">
      {diagnosis.analysis ? (
        <Card
          title="追加を推奨するコンテンツ"
          description="上位ページとの差分と検索意図から、どこに何を足すべきかを提案しています。"
        >
          {proposals.length > 0 ? (
            <ol className="space-y-4">
              {proposals.map((p, i) => (
                <li key={`${p.location}:${i}`} className="rounded-sm border border-line bg-surface p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <p className="text-[13px] font-bold text-ink">
                      {i + 1}. 追加する箇所: {p.location}
                    </p>
                    <CopyButton
                      text={`追加を推奨する箇所: ${p.location}\n追加するコンテンツの概要: ${p.outline}\n提案理由: ${p.reason}`}
                      label="提案をコピー"
                    />
                  </div>
                  <dl className="mt-2 space-y-2 text-[13px] leading-relaxed">
                    <div>
                      <dt className="font-bold text-muted">追加するコンテンツの概要</dt>
                      <dd className="mt-0.5 whitespace-pre-wrap text-ink">{p.outline}</dd>
                    </div>
                    <div>
                      <dt className="font-bold text-muted">提案理由</dt>
                      <dd className="mt-0.5 whitespace-pre-wrap text-ink">{p.reason}</dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-[13px] text-muted">追加提案はありませんでした。</p>
          )}
        </Card>
      ) : (
        <EmptyState
          title="AI によるコンテンツ提案は行われていません"
          description="提案の生成には ANTHROPIC_API_KEY が必要です。サーバーに設定して、もう一度診断を実行してください。"
        />
      )}

      <ChatPanel key={diagnosis.id} diagnosis={diagnosis} disabled={!chatEnabled} />
    </div>
  );
}
