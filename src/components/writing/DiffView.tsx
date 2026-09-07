"use client";

/**
 * 変更前後の差分表示（D3）。語単位の diff を色分けし、採用 / 破棄を選ばせる。
 * 色は判定色トークン（pass = 追加、fail = 削除）だけを使う。
 */
import { useMemo } from "react";
import { Badge, Button, Card } from "@/components/ui";
import { diffStats, diffWords } from "@/lib/writing/diff";

export interface DiffViewProps {
  before: string;
  after: string;
  /** 選択範囲だけを書き換えたか */
  selection?: boolean;
  onAccept: () => void;
  onReject: () => void;
  busy?: boolean;
}

export function DiffView({ before, after, selection = false, onAccept, onReject, busy = false }: DiffViewProps) {
  const parts = useMemo(() => diffWords(before, after), [before, after]);
  const stats = useMemo(() => diffStats(parts), [parts]);

  return (
    <Card
      title="変更内容の確認"
      description={
        selection
          ? "選択範囲だけを書き換えました。採用すると本文に反映し、バージョン履歴に 1 版残します。"
          : "本文全体を書き換えました。採用すると本文に反映し、バージョン履歴に 1 版残します。"
      }
      actions={
        <>
          <Button onClick={onAccept} disabled={busy}>
            採用する
          </Button>
          <Button variant="secondary" onClick={onReject} disabled={busy}>
            破棄する
          </Button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2 text-[12px] text-muted">
        <Badge tone="pass" icon={false}>
          +{stats.added} 字
        </Badge>
        <Badge tone="fail" icon={false}>
          −{stats.removed} 字
        </Badge>
        {!stats.changed && <span>変更はありませんでした。</span>}
      </div>
      <div className="max-h-96 overflow-y-auto rounded-sm border border-line bg-surface p-3 text-[13px] leading-relaxed whitespace-pre-wrap">
        {parts.map((part, i) => {
          if (part.op === "equal") return <span key={i}>{part.text}</span>;
          if (part.op === "insert") {
            return (
              <ins key={i} className="bg-pass-soft text-pass no-underline">
                {part.text}
              </ins>
            );
          }
          return (
            <del key={i} className="bg-fail-soft text-fail">
              {part.text}
            </del>
          );
        })}
      </div>
    </Card>
  );
}
