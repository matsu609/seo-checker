"use client";

/**
 * 語単位の差分表示（読み取り専用）。
 *
 * AI ライティングの DiffView（採用 / 破棄つき）と、HP 改修提案の before → after で
 * 同じ見え方にするために切り出したもの。色は判定色トークンだけを使う
 * （pass = 追加、fail = 削除）。
 */
import { useMemo } from "react";
import { diffStats, diffWords } from "@/lib/writing/diff";
import { Badge } from "./Badge";

export interface InlineDiffProps {
  before: string;
  after: string;
  /** 変更が無いときに出す文言 */
  emptyText?: string;
  /** 高さの上限（既定 max-h-96）。0 を渡すと制限しない */
  maxHeightClass?: string;
  className?: string;
}

export function InlineDiff({
  before,
  after,
  emptyText = "変更はありませんでした。",
  maxHeightClass = "max-h-96",
  className = "",
}: InlineDiffProps) {
  const parts = useMemo(() => diffWords(before, after), [before, after]);
  const stats = useMemo(() => diffStats(parts), [parts]);

  return (
    <div className={className}>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-[12px] text-muted">
        <Badge tone="pass" icon={false}>
          +{stats.added} 字
        </Badge>
        <Badge tone="fail" icon={false}>
          −{stats.removed} 字
        </Badge>
        {!stats.changed && <span>{emptyText}</span>}
      </div>
      <div
        className={`${maxHeightClass} overflow-y-auto rounded-sm border border-line bg-surface p-3 text-[13px] leading-relaxed whitespace-pre-wrap`}
      >
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
    </div>
  );
}
