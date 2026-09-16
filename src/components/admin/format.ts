/**
 * マスター画面と代理店画面で共通の見た目の決まりごと。
 * サーバー・クライアントのどちらからも読めるよう、定数と純粋関数だけを置く。
 */
import type { ContractStatus } from "@/lib/admin/billing";

/** 契約状況の色。支払い遅延だけは目立たせる */
export const STATUS_TONE: Record<ContractStatus, string> = {
  active: "text-pass border-pass bg-pass-soft",
  trial: "text-info border-info bg-info-soft",
  past_due: "text-fail border-fail bg-fail-soft",
  canceled: "text-warn border-warn bg-warn-soft",
  ended: "text-muted border-line bg-surface",
  upcoming: "text-info border-info bg-info-soft",
  none: "text-muted border-line bg-surface",
  unknown: "text-muted border-line bg-surface",
};

export function formatDate(ms: number | null): string {
  if (!ms) return "—";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ja-JP", { year: "numeric", month: "2-digit", day: "2-digit" });
}

/** プランがどこから決まったか（契約 / 手動 / 既定 / 無料） */
export function planSourceLabel(source: "billing" | "metadata" | "env" | "default"): string {
  if (source === "billing") return "契約";
  if (source === "metadata") return "手動";
  if (source === "env") return "既定";
  return "無料";
}
