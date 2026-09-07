import type { ReactNode } from "react";
import { StatusIcon } from "@/components/Icons";
import type { Grade, StatusTone } from "@/lib/ui/palette";
import { TONE_LABELS } from "@/lib/ui/palette";

/**
 * ピル / チップ。11px / 700、必ず 1px の枠線（背景オフの印刷でも読める）。
 * - pass / warn / fail / info: 判定ピル（12px のアイコン付き。色だけに頼らない）
 * - grade: グレード A〜E（枠と文字がグレード色、地は panel）
 * - free: 「無料」（accent）
 * - id: 機能 ID チップ（font-mono 10px、角丸 sm）
 * - neutral: β / 準備中 / 要設定（muted、地は surface）
 */
export type BadgeTone = StatusTone | "grade" | "free" | "id" | "neutral";

const GRADE_CLASS: Record<Grade, string> = {
  A: "text-grade-a border-grade-a",
  B: "text-grade-b border-grade-b",
  C: "text-grade-c border-grade-c",
  D: "text-grade-d border-grade-d",
  E: "text-grade-e border-grade-e",
};

const TONE_CLASS: Record<Exclude<BadgeTone, "grade">, string> = {
  pass: "text-pass border-pass bg-pass-soft",
  warn: "text-warn border-warn bg-warn-soft",
  fail: "text-fail border-fail bg-fail-soft",
  info: "text-info border-info bg-info-soft",
  free: "text-accent border-accent bg-accent-soft",
  id: "text-muted border-line bg-panel font-mono",
  neutral: "text-muted border-line bg-surface",
};

export interface BadgeProps {
  tone?: BadgeTone;
  /** tone="grade" のとき */
  grade?: Grade;
  /** 判定ピルにアイコンを付ける（既定 true） */
  icon?: boolean;
  children?: ReactNode;
  className?: string;
  title?: string;
}

export function Badge({ tone = "neutral", grade, icon = true, children, className = "", title }: BadgeProps) {
  const isStatus = tone === "pass" || tone === "warn" || tone === "fail" || tone === "info";
  const shape = tone === "id" ? "rounded-sm px-1 text-[10px]" : "rounded-full px-2 py-0.5 text-[11px]";
  const color = tone === "grade" ? `${GRADE_CLASS[grade ?? "E"]} bg-panel` : TONE_CLASS[tone];
  const label = children ?? (isStatus ? TONE_LABELS[tone] : grade);
  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap border font-bold leading-4 ${shape} ${color} ${className}`}
    >
      {isStatus && icon && <StatusIcon status={tone} className="h-3 w-3" />}
      {label}
    </span>
  );
}

/** 機能 ID チップの並び（例: A1 A2）。上限を超えた分は「+N」 */
export function FeatureIdChips({
  ids,
  max = 4,
  className = "",
}: {
  ids: readonly string[];
  max?: number;
  className?: string;
}) {
  if (ids.length === 0) return null;
  const shown = ids.slice(0, max);
  const rest = ids.length - shown.length;
  return (
    <span className={`inline-flex items-center gap-1 ${className}`} aria-label={`機能 ID: ${ids.join(", ")}`}>
      {shown.map((id) => (
        <Badge key={id} tone="id">
          {id}
        </Badge>
      ))}
      {rest > 0 && (
        <Badge tone="id" title={ids.slice(max).join(", ")}>
          +{rest}
        </Badge>
      )}
    </span>
  );
}
