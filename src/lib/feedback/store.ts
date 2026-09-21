/**
 * ご意見・不具合の報告の保存（Supabase の `feedback` テーブル）。サーバー専用。
 *
 * 本人の読み出しは必ず user_id で絞る（service_role は RLS を素通りするので、ここが唯一の境界）。
 * 全件を読めるのは運営者（マスター）だけ（画面は /admin/feedback）。権限の確認は API 側（requireAdmin）。
 * テーブル定義は docs/dev/OPERATIONS.md の SQL（r128）を参照。
 */
import { z } from "zod";
import { eq } from "@/lib/db/filters";
import { supabaseRest } from "@/lib/db/supabase";
import {
  FEEDBACK_COLUMNS,
  FeedbackRowSchema,
  fromFeedbackRow,
  type FeedbackKind,
  type FeedbackRecord,
  type FeedbackStatus,
  type FeedbackUpdate,
} from "./types";

const TABLE = "feedback";

/** 本人の履歴の取得上限 */
export const OWN_FEEDBACK_LIMIT = 50;
/** 運営者の一覧の取得上限（古いものはこの範囲に入らない。増えたら状態で絞る） */
export const ADMIN_FEEDBACK_LIMIT = 300;

function parseRows(rows: unknown): FeedbackRecord[] {
  const parsed = z.array(FeedbackRowSchema).safeParse(rows);
  if (!parsed.success) throw new Error("ご意見の応答を読めませんでした");
  return parsed.data.map(fromFeedbackRow);
}

export interface NewFeedback {
  userId: string;
  email: string;
  name: string;
  kind: FeedbackKind;
  body: string;
  path: string;
  plan: string;
  userAgent: string;
  commit: string;
  release: number;
}

/** 1 件保存して、保存後の記録を返す */
export async function createFeedback(input: NewFeedback, at = new Date()): Promise<FeedbackRecord> {
  const now = at.toISOString();
  const rows = await supabaseRest<unknown>(`${TABLE}?select=${FEEDBACK_COLUMNS}`, {
    method: "POST",
    body: {
      user_id: input.userId,
      email: input.email,
      name: input.name,
      kind: input.kind,
      body: input.body,
      path: input.path,
      plan: input.plan,
      user_agent: input.userAgent,
      commit: input.commit,
      release: input.release,
      status: "open",
      created_at: now,
      updated_at: now,
    },
    prefer: "return=representation",
  });
  const r = parseRows(rows)[0];
  if (!r) throw new Error("保存後の応答を読めませんでした");
  return r;
}

/** 本人の履歴（新しい順） */
export async function listOwnFeedback(userId: string): Promise<FeedbackRecord[]> {
  return parseRows(
    await supabaseRest<unknown>(`${TABLE}?select=${FEEDBACK_COLUMNS}&user_id=${eq(userId)}&order=created_at.desc&limit=${OWN_FEEDBACK_LIMIT}`),
  );
}

/** 運営者向け: 全員分（新しい順）。status を渡すとその状態だけ */
export async function listAllFeedback(status?: FeedbackStatus): Promise<FeedbackRecord[]> {
  const filter = status ? `&status=${eq(status)}` : "";
  return parseRows(
    await supabaseRest<unknown>(`${TABLE}?select=${FEEDBACK_COLUMNS}${filter}&order=created_at.desc&limit=${ADMIN_FEEDBACK_LIMIT}`),
  );
}

/** 運営者向け: 状態・返答を更新。見つからなければ null */
export async function updateFeedback(id: string, patch: FeedbackUpdate, at = new Date()): Promise<FeedbackRecord | null> {
  const body: Record<string, unknown> = { updated_at: at.toISOString() };
  if (patch.status !== undefined) body.status = patch.status;
  if (patch.reply !== undefined) {
    const reply = patch.reply && patch.reply.trim().length > 0 ? patch.reply.trim() : null;
    body.reply = reply;
    body.replied_at = reply ? at.toISOString() : null;
  }
  const rows = await supabaseRest<unknown>(`${TABLE}?select=${FEEDBACK_COLUMNS}&id=${eq(id)}`, {
    method: "PATCH",
    body,
    prefer: "return=representation",
  });
  return parseRows(rows)[0] ?? null;
}
