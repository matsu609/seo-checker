/**
 * お知らせ（Supabase の notifications テーブル）。サーバー専用。
 *
 * 1 行 = 利用者への 1 件のお知らせ。メールを送れたかどうかは emailed_at に残す
 * （送れていないものを「送った」と見せない）。行は必ず user_id で絞る。
 *
 * SQL（Supabase SQL Editor で 1 回）:
 *   create table if not exists notifications (
 *     id uuid primary key default gen_random_uuid(),
 *     user_id text not null,
 *     kind text not null,
 *     title text not null,
 *     body text not null default '',
 *     link text,
 *     created_at timestamptz not null default now(),
 *     emailed_at timestamptz,
 *     read_at timestamptz
 *   );
 *   create index if not exists notifications_user_idx on notifications (user_id, created_at desc);
 *   alter table notifications enable row level security;
 */
import { z } from "zod";
import { eq, gte, lt } from "@/lib/db/filters";
import { selectAllPages, supabaseRest } from "@/lib/db/supabase";
import { NOTIFICATION_KINDS, type Notification, type NotificationKind } from "./types";

const TABLE = "notifications";
const COLUMNS = "id,kind,title,body,link,created_at,emailed_at,read_at";
export const NOTIFICATIONS_LIMIT = 50;

const RowSchema = z.object({
  id: z.string(),
  kind: z.string(),
  title: z.string(),
  body: z.string(),
  link: z.string().nullable(),
  created_at: z.string(),
  emailed_at: z.string().nullable(),
  read_at: z.string().nullable(),
});

function fromRow(row: z.infer<typeof RowSchema>): Notification {
  const kind = (NOTIFICATION_KINDS as readonly string[]).includes(row.kind) ? (row.kind as NotificationKind) : "site_incident";
  return { id: row.id, kind, title: row.title, body: row.body, link: row.link, createdAt: row.created_at, emailedAt: row.emailed_at, readAt: row.read_at };
}

export interface NewNotification {
  kind: NotificationKind;
  title: string;
  body: string;
  link?: string | null;
}

export async function insertNotification(userId: string, input: NewNotification, at = new Date()): Promise<Notification> {
  const rows = await supabaseRest<unknown>(`${TABLE}?select=${COLUMNS}`, {
    method: "POST",
    body: { user_id: userId, kind: input.kind, title: input.title.slice(0, 200), body: input.body.slice(0, 4000), link: input.link ?? null, created_at: at.toISOString() },
    prefer: "return=representation",
  });
  const parsed = z.array(RowSchema).min(1).safeParse(rows);
  if (!parsed.success) throw new Error("お知らせを保存できませんでした");
  return fromRow(parsed.data[0]);
}

export async function markEmailed(userId: string, id: string, at = new Date()): Promise<void> {
  await supabaseRest<unknown>(`${TABLE}?user_id=${eq(userId)}&id=${eq(id)}`, { method: "PATCH", body: { emailed_at: at.toISOString() }, prefer: "return=minimal" });
}

export async function listNotifications(userId: string, limit = NOTIFICATIONS_LIMIT): Promise<Notification[]> {
  const rows = await supabaseRest<unknown>(`${TABLE}?select=${COLUMNS}&user_id=${eq(userId)}&order=created_at.desc&limit=${limit}`);
  const parsed = z.array(RowSchema).safeParse(rows);
  if (!parsed.success) throw new Error("お知らせの応答を読めませんでした");
  return parsed.data.map(fromRow);
}

/** 未読を全部既読に */
export async function markAllRead(userId: string, at = new Date()): Promise<void> {
  await supabaseRest<unknown>(`${TABLE}?user_id=${eq(userId)}&read_at=is.null`, { method: "PATCH", body: { read_at: at.toISOString() }, prefer: "return=minimal" });
}

/** 1 か月ぶんの集計で読む行数の上限（1 利用者のお知らせ。ふつうは数十件） */
export const COUNT_SCAN_MAX = 10_000;

/**
 * ある月の種類ごとの件数（月次レポートの「今月の出来事」に使う）。
 * 以前は `limit=2000` の 1 回で読んでいたが、Supabase は 1 回の応答を 1,000 行に切るので、
 * 1,000 件を超えた月は黙って少なく数えていた。ページに分けて最後まで読む（2026-09-23）。
 */
export async function countNotificationsBetween(userId: string, startIso: string, endIso: string): Promise<Record<string, number>> {
  const rows = await selectAllPages(
    `${TABLE}?select=kind&user_id=${eq(userId)}&created_at=${gte(startIso)}&created_at=${lt(endIso)}&order=created_at.asc,id.asc`,
    { max: COUNT_SCAN_MAX },
  );
  const parsed = z.array(z.object({ kind: z.string() })).safeParse(rows);
  const out: Record<string, number> = {};
  if (!parsed.success) return out;
  for (const r of parsed.data) out[r.kind] = (out[r.kind] ?? 0) + 1;
  return out;
}
