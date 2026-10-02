/**
 * 無料診断の月の回数（全員で分け合う 1 つの枠）。サーバー専用。
 *
 * 利用者の決定 2026-10-02: パスワードの代わりに「月に 50 回」のような上限で守る。
 * 回数は無料診断の画面の上とマスター画面に出す（不正利用と、営業がどれだけ使っているかが分かる）。
 *
 * 記録先は Supabase の `usage_events`（r146 の月の回数上限と同じテーブル。user_id = "free-link"、
 * feature = free-page / free-site / free-meo、meta = { target, ip }）。行が残るので「いつ・何を・どこから」が
 * あとから見える。**テーブルが無い・Supabase が未設定のときはプロセス内メモリで数える**（インスタンスごと・
 * デプロイで 0 に戻る。止まりはしないが正確ではない。マスター画面に「記録先: メモリ」と出す）。
 *
 * 順番: 外部 API を呼ぶ前に checkFreeRun()（上限なら 429）→ 呼べたら recordFreeRun()（失敗しても診断は止めない）。
 * 同時に押されたときの 1〜2 回の超過は許容する。
 */
import { z } from "zod";
import { NO_STORE } from "@/lib/api/headers";
import { eq, gte } from "@/lib/db/filters";
import { isSupabaseConfigured, supabaseRest } from "@/lib/db/supabase";
import { jstMonthKey, monthRangeJst } from "@/lib/time/jst";
import { usageResetsOn } from "@/lib/usage/limits";
import { envInt } from "./ratelimit";
import { FREE_MONTHLY_CODE } from "./session-rules";
import { FREE_MONTHLY_LIMIT_DEFAULT, freeMonthlyLimitMessage, freeRunsOf, isFreeRunKind, type FreeRunKind, type FreeRunRecord, type FreeRuns } from "./monthly-rules";

const TABLE = "usage_events";
/** usage_events の user_id（お客様の ID と混ざらない固定の値） */
export const FREE_RUNS_USER_ID = "free-link";
const READ_LIMIT = 5000;
const MEMORY_KEEP = 200;

/** 月の上限（環境変数 FREE_MONTHLY_LIMIT。0 で停止） */
export function freeMonthlyLimit(): number {
  return Math.max(0, envInt("FREE_MONTHLY_LIMIT", FREE_MONTHLY_LIMIT_DEFAULT));
}

// ---- メモリの控え（Supabase が無いとき）
interface MemoryStore {
  records: FreeRunRecord[];
}
function memory(): MemoryStore {
  const g = globalThis as unknown as { __seo_checker_free_runs?: MemoryStore };
  g.__seo_checker_free_runs ??= { records: [] };
  return g.__seo_checker_free_runs;
}
/** テスト用 */
export function resetFreeRunsMemory(): void {
  memory().records = [];
}
function memoryThisMonth(month: string): FreeRunRecord[] {
  return memory().records.filter((r) => jstMonthKey(new Date(r.at)) === month);
}

let warned = false;
function warnOnce(err: unknown) {
  if (warned) return;
  warned = true;
  console.warn("[free] 無料診断の回数を Supabase に記録できません（メモリで数えます。usage_events テーブルの SQL を確認）", err instanceof Error ? err.message : err);
}

const RowSchema = z.object({
  feature: z.string(),
  created_at: z.string(),
  meta: z.object({ target: z.string().optional(), ip: z.string().nullable().optional() }).nullable().optional(),
});

function rowToRecord(r: z.infer<typeof RowSchema>): FreeRunRecord | null {
  if (!isFreeRunKind(r.feature)) return null;
  return { at: r.created_at, kind: r.feature, target: r.meta?.target ?? "", ip: r.meta?.ip ?? null };
}

async function supabaseThisMonth(month: string): Promise<FreeRunRecord[]> {
  const { start } = monthRangeJst(month);
  const rows = await supabaseRest<unknown>(
    `${TABLE}?select=feature,created_at,meta&user_id=${eq(FREE_RUNS_USER_ID)}&created_at=${gte(start)}&order=created_at.desc&limit=${READ_LIMIT}`,
  );
  const parsed = z.array(RowSchema).safeParse(rows);
  if (!parsed.success) return [];
  return parsed.data.map(rowToRecord).filter((r): r is FreeRunRecord => r !== null);
}

/** 今月の記録（新しい順）と、数えている場所 */
async function recordsThisMonth(now = new Date()): Promise<{ month: string; records: FreeRunRecord[]; source: FreeRuns["source"] }> {
  const month = jstMonthKey(now);
  if (isSupabaseConfigured()) {
    try {
      return { month, records: await supabaseThisMonth(month), source: "supabase" };
    } catch (err) {
      warnOnce(err);
    }
  }
  return { month, records: memoryThisMonth(month).slice().reverse(), source: "memory" };
}

/** 今月の回数（画面の上とマスター画面に出す） */
export async function freeRunsThisMonth(now = new Date()): Promise<FreeRuns> {
  const { month, records, source } = await recordsThisMonth(now);
  return freeRunsOf(month, records.length, freeMonthlyLimit(), usageResetsOn(now), source);
}

/** 今月の記録（マスター画面の一覧用。新しい順に最大 `limit` 件） */
export async function recentFreeRuns(limit = 30, now = new Date()): Promise<{ runs: FreeRuns; records: FreeRunRecord[] }> {
  const { month, records, source } = await recordsThisMonth(now);
  return {
    runs: freeRunsOf(month, records.length, freeMonthlyLimit(), usageResetsOn(now), source),
    records: records.slice(0, limit),
  };
}

/** 上限内なら null、達していれば 429 の Response（記録はしない） */
export async function checkFreeRun(now = new Date()): Promise<Response | null> {
  const runs = await freeRunsThisMonth(now);
  if (runs.remaining > 0) return null;
  return Response.json({ error: freeMonthlyLimitMessage(runs), code: FREE_MONTHLY_CODE, runs }, { status: 429, headers: NO_STORE });
}

/** 1 回ぶん記録する（外部 API を実際に呼んだあと。失敗しても診断は止めない） */
export async function recordFreeRun(kind: FreeRunKind, target: string, ip: string | null, now = new Date()): Promise<void> {
  const record: FreeRunRecord = { at: now.toISOString(), kind, target: target.slice(0, 300), ip };
  if (isSupabaseConfigured()) {
    try {
      await supabaseRest<unknown>(TABLE, {
        method: "POST",
        body: { user_id: FREE_RUNS_USER_ID, feature: kind, amount: 1, meta: { target: record.target, ip } },
        prefer: "return=minimal",
      });
      return;
    } catch (err) {
      warnOnce(err);
    }
  }
  const m = memory();
  m.records.push(record);
  if (m.records.length > MEMORY_KEEP) m.records.splice(0, m.records.length - MEMORY_KEEP);
}
