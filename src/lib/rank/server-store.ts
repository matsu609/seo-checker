/**
 * 自動計測した順位の保存先（Supabase の rank_snapshots テーブル）。サーバー専用。
 *
 * 手動計測の履歴はブラウザ側（rankSnapshotsStore → user_stores の写し）にあるが、
 * Cron がそこへ書くと端末側の同期と衝突する。サーバーが作った分はこの表に持ち、
 * 画面が開いたときに端末側へ取り込む（同じ語・同じ日は後勝ちで 1 件）。
 *
 * SQL（Supabase SQL Editor で 1 回）:
 *   create table if not exists rank_snapshots (
 *     user_id text not null,
 *     keyword_id text not null,
 *     taken_on date not null,
 *     snapshot jsonb not null,
 *     created_at timestamptz not null default now(),
 *     primary key (user_id, keyword_id, taken_on)
 *   );
 *   create index if not exists rank_snapshots_user_idx on rank_snapshots (user_id, taken_on desc);
 *   alter table rank_snapshots enable row level security;
 */
import { z } from "zod";
import { eq, gte } from "@/lib/db/filters";
import { supabaseRest } from "@/lib/db/supabase";
import { RankSnapshotSchema, type RankSnapshot } from "./store";

const TABLE = "rank_snapshots";
/** 画面へ返す上限（180 日 × 300 語でもこの範囲） */
export const SERVER_SNAPSHOTS_LIMIT = 20_000;

export async function saveRankSnapshots(userId: string, snapshots: readonly RankSnapshot[]): Promise<void> {
  if (snapshots.length === 0) return;
  await supabaseRest<unknown>(`${TABLE}?on_conflict=user_id,keyword_id,taken_on`, {
    method: "POST",
    body: snapshots.map((s) => ({ user_id: userId, keyword_id: s.keywordId, taken_on: s.takenOn, snapshot: s })),
    prefer: "return=minimal,resolution=merge-duplicates",
  });
}

const RowSchema = z.object({ snapshot: z.unknown() });

export async function listRankSnapshots(userId: string, options: { sinceDate?: string; limit?: number } = {}): Promise<RankSnapshot[]> {
  const since = options.sinceDate ? `&taken_on=${gte(options.sinceDate)}` : "";
  const rows = await supabaseRest<unknown>(
    `${TABLE}?select=snapshot&user_id=${eq(userId)}${since}&order=taken_on.asc&limit=${options.limit ?? SERVER_SNAPSHOTS_LIMIT}`,
  );
  const parsed = z.array(RowSchema).safeParse(rows);
  if (!parsed.success) return [];
  const out: RankSnapshot[] = [];
  for (const r of parsed.data) {
    const s = RankSnapshotSchema.safeParse(r.snapshot);
    if (s.success) out.push(s.data);
  }
  return out;
}

/** 最後に自動計測した日（無ければ null） */
export async function lastRankRunDate(userId: string): Promise<string | null> {
  const rows = await supabaseRest<unknown>(`${TABLE}?select=taken_on&user_id=${eq(userId)}&order=taken_on.desc&limit=1`);
  const parsed = z.array(z.object({ taken_on: z.string() })).safeParse(rows);
  return parsed.success && parsed.data[0] ? parsed.data[0].taken_on : null;
}
