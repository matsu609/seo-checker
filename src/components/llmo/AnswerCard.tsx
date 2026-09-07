"use client";

/**
 * 回答原文の折りたたみカード。引用元 URL とファンアウトクエリも一緒に見せる。
 * 失敗した行は理由だけを出す（ダミーの回答は作らない）。
 */
import { Badge } from "@/components/ui";
import { providerLabel } from "@/lib/llmo/providers/meta";
import type { LlmoEntity, LlmoRun } from "@/lib/llmo/types";

export interface AnswerCardProps {
  run: LlmoRun;
  entities: readonly LlmoEntity[];
  /** 既定で開いておくか */
  open?: boolean;
}

export function AnswerCard({ run, entities, open = false }: AnswerCardProps) {
  const mentioned = run.judgements.filter((j) => j.brandMentioned);
  const cited = run.judgements.filter((j) => j.domainCited);
  const nameOf = (id: string) => entities.find((e) => e.id === id)?.name ?? id;

  return (
    <details open={open} className="rounded-sm border border-line bg-panel">
      <summary className="cursor-pointer list-none px-3 py-2 text-[13px] text-ink marker:content-none">
        <span className="flex flex-wrap items-center gap-2">
          <Badge tone="neutral">{providerLabel(run.providerId)}</Badge>
          <span className="min-w-0 flex-1 truncate font-bold">{run.promptText}</span>
          {run.status === "error" ? (
            <Badge tone="fail">失敗</Badge>
          ) : (
            <>
              <Badge tone={mentioned.length > 0 ? "pass" : "neutral"} icon={false}>
                言及 {mentioned.length}
              </Badge>
              <Badge tone={cited.length > 0 ? "pass" : "neutral"} icon={false}>
                引用 {cited.length}
              </Badge>
            </>
          )}
        </span>
      </summary>
      <div className="border-t border-line px-3 py-3 text-[13px] leading-relaxed">
        <p className="mb-2 text-[11px] text-muted">
          {run.takenOn}／モデル {run.model}
        </p>
        {run.status === "error" ? (
          <p className="text-fail">{run.error ?? "実行に失敗しました"}</p>
        ) : (
          <>
            <p className="max-h-72 overflow-y-auto whitespace-pre-wrap border-l-2 border-accent pl-3 text-ink">
              {run.answer || "（回答本文が空でした）"}
            </p>
            {mentioned.length > 0 && (
              <p className="mt-2 text-[12px] text-muted">
                言及: {mentioned.map((j) => `${nameOf(j.entityId)}（${j.matchedAliases.join("・")}）`).join(" / ")}
              </p>
            )}
            <h4 className="mt-3 text-[12px] font-bold text-ink">引用元（{run.citations.length}）</h4>
            {run.citations.length === 0 ? (
              <p className="text-[12px] text-muted">引用元は返されませんでした。</p>
            ) : (
              <ol className="mt-1 space-y-1">
                {run.citations.map((c, i) => (
                  <li key={`${c.url}-${i}`} className="border-b border-line py-1 text-[12px] last:border-0">
                    <span className="mr-1 text-[11px] text-muted tabular-nums">{i + 1}.</span>
                    <a
                      href={c.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-all text-accent underline-offset-2 hover:underline"
                    >
                      {c.title ?? c.url}
                    </a>
                  </li>
                ))}
              </ol>
            )}
            <h4 className="mt-3 text-[12px] font-bold text-ink">ファンアウトクエリ（{run.searchQueries.length}）</h4>
            {run.fanoutSupported ? (
              run.searchQueries.length === 0 ? (
                <p className="text-[12px] text-muted">検索クエリは発行されませんでした。</p>
              ) : (
                <ul className="mt-1 flex flex-wrap gap-1.5">
                  {run.searchQueries.map((q) => (
                    <li key={q} className="rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] text-ink">
                      {q}
                    </li>
                  ))}
                </ul>
              )
            ) : (
              <p className="text-[12px] text-muted">
                {providerLabel(run.providerId)} は検索クエリを返さないため対象外です。
              </p>
            )}
          </>
        )}
      </div>
    </details>
  );
}
