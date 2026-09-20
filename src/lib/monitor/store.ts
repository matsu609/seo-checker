/**
 * 監視のスナップショット（Supabase の site_monitor_snapshots テーブル）。サーバー専用。
 *
 * SQL（Supabase SQL Editor で 1 回）:
 *   create table if not exists site_monitor_snapshots (
 *     id uuid primary key default gen_random_uuid(),
 *     user_id text not null,
 *     origin text not null,
 *     checked_at timestamptz not null,
 *     incidents int not null default 0,
 *     snapshot jsonb not null
 *   );
 *   create index if not exists site_monitor_user_idx on site_monitor_snapshots (user_id, origin, checked_at desc);
 *   alter table site_monitor_snapshots enable row level security;
 */
import { z } from "zod";
import { eq } from "@/lib/db/filters";
import { supabaseRest } from "@/lib/db/supabase";
import type { MonitorSnapshot } from "./types";

const TABLE = "site_monitor_snapshots";
export const MONITOR_HISTORY_LIMIT = 12;

export interface MonitorHistoryItem {
  id: string;
  checkedAt: string;
  incidents: number;
}

const ListRow = z.object({ id: z.string(), checked_at: z.string(), incidents: z.number() });
const FullRow = ListRow.extend({ snapshot: z.unknown() });

export async function saveSnapshot(userId: string, snapshot: MonitorSnapshot): Promise<void> {
  await supabaseRest<unknown>(TABLE, {
    method: "POST",
    body: { user_id: userId, origin: snapshot.origin, checked_at: snapshot.checkedAt, incidents: snapshot.incidents.length, snapshot },
    prefer: "return=minimal",
  });
}

export async function latestSnapshots(userId: string, origin: string, count = 2): Promise<MonitorSnapshot[]> {
  const rows = await supabaseRest<unknown>(`${TABLE}?select=id,checked_at,incidents,snapshot&user_id=${eq(userId)}&origin=${eq(origin)}&order=checked_at.desc&limit=${count}`);
  const parsed = z.array(FullRow).safeParse(rows);
  if (!parsed.success) return [];
  return parsed.data.map((r) => r.snapshot as MonitorSnapshot);
}

export async function listSnapshots(userId: string, origin: string, limit = MONITOR_HISTORY_LIMIT): Promise<MonitorHistoryItem[]> {
  const rows = await supabaseRest<unknown>(`${TABLE}?select=id,checked_at,incidents&user_id=${eq(userId)}&origin=${eq(origin)}&order=checked_at.desc&limit=${limit}`);
  const parsed = z.array(ListRow).safeParse(rows);
  if (!parsed.success) return [];
  return parsed.data.map((r) => ({ id: r.id, checkedAt: r.checked_at, incidents: r.incidents }));
}
