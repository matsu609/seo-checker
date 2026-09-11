/**
 * 回答の CSV（純粋関数）。Excel で開いたときの式インジェクション対策として、
 * 先頭が = + - @ のセルには ' を付ける。第三者（来店客）が書いた文字列が入るため。
 */
import { resolveStore, type ReviewChannel, type ReviewForm } from "./forms";
import { answerLines, type ReviewQuestion } from "./questions";
import { RESPONSE_STATUS_LABELS, type ReviewResponse } from "./responses";

export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function responsesToCsv(
  responses: readonly ReviewResponse[],
  form: Pick<ReviewForm, "questions" | "storeName" | "writeReviewUrl">,
  channels: readonly ReviewChannel[],
): string {
  const questions: readonly ReviewQuestion[] = form.questions;
  const byId = new Map(channels.map((c) => [c.id, c]));
  const storeOf = (id: string | null) => resolveStore(form, (id && byId.get(id)) || null).storeName;
  const labelOf = new Map(channels.map((c) => [c.id, c.label]));
  const header = [
    "回答日時",
    "店舗",
    "経路（QR）",
    "評価",
    "低評価",
    ...questions.map((q) => q.label),
    "AI 下書き",
    "投稿時の本文",
    "投稿ボタン押下",
    "お店に直接伝える",
    "連絡先",
    "対応状態",
    "対応メモ",
  ];
  const rows = responses.map((r) => {
    const lines = new Map(answerLines(questions, r.answers).map((l) => [l.label, l.value]));
    return [
      r.createdAt,
      storeOf(r.channelId),
      r.channelId ? (labelOf.get(r.channelId) ?? "") : "",
      r.rating,
      r.isLow ? "はい" : "",
      ...questions.map((q) => lines.get(q.label) ?? ""),
      r.draft,
      r.draftFinal,
      r.clickedReviewAt ?? "",
      r.directMessage,
      r.directContact,
      RESPONSE_STATUS_LABELS[r.status],
      r.note,
    ].map(csvCell);
  });
  // BOM を付けて Excel で文字化けしないようにする
  return `\uFEFF${[header.map(csvCell), ...rows].map((r) => r.join(",")).join("\r\n")}\r\n`;
}
