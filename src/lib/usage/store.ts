/**
 * 実費の出る機能の利用の記録（Supabase の `usage_events` テーブル）。サーバー専用。
 *
 * 1 回の呼び出し = 1 行。月の合計はこの行の amount を足して出す（精密診断の analysis_runs と同じ考え方。
 * 行が残るので「誰がいつ何を何回使ったか」を後から見られる。meta に外部 API の回数やトークン数を入れられる）。
 *
 * SQL（Supabase SQL Editor で 1 回。docs/dev/OPERATIONS.md にも同じもの）:
 *   create table if not exists usage_events (
 *     id bigint generated always as identity primary key,
 *     user_id text not null,
 *     feature text not null,
 *     amount integer not null default 1,
 *     meta jsonb,
 *     created_at timestamptz not null default now()
 *   );
 *   create index if not exists usage_events_user_idx on usage_events (user_id, created_at desc);
 *   alter table usage_events enable row level security;
 */
import { z } from "zod";
import { eq, gte } from "@/lib/db/filters";
import { supabaseRest } from "@/lib/db/supabase";
import { jstMonthKey, monthRangeJst } from "@/lib/time/jst";
import { USAGE_FEATURES, type UsageFeature } from "./limits";

const TABLE = "usage_events";
/** 1 か月ぶんの読み出し上限（1 人が月に 5,000 行を超えることは上限の設計上ない） */
const READ_LIMIT = 5000;

const RowSchema = z.object({ feature: z.string(), amount: z.number() });

/** 今月（日本時間）の機能ごとの合計 */
export async function sumUsageThisMonth(userId: string, now = new Date()): Promise<Record<UsageFeature, number>> {
  const { start } = monthRangeJst(jstMonthKey(now));
  const rows = await supabaseRest<unknown>(`${TABLE}?select=feature,amount&user_id=${eq(userId)}&created_at=${gte(start)}&limit=${READ_LIMIT}`);
  const out = Object.fromEntries(USAGE_FEATURES.map((k) => [k, 0])) as Record<UsageFeature, number>;
  const parsed = z.array(RowSchema).safeParse(rows);
  if (!parsed.success) return out;
  for (const r of parsed.data) {
    if ((USAGE_FEATURES as readonly string[]).includes(r.feature)) out[r.feature as UsageFeature] += Math.max(0, Math.floor(r.amount));
  }
  return out;
}

/** 1 回ぶんを記録する（呼び出し側は失敗しても機能を止めない） */
export async function recordUsage(userId: string, feature: UsageFeature, amount: number, meta?: Record<string, unknown>): Promise<void> {
  await supabaseRest<unknown>(TABLE, {
    method: "POST",
    body: { user_id: userId, feature, amount: Math.max(1, Math.floor(amount)), meta: meta ?? null },
    prefer: "return=minimal",
  });
}
