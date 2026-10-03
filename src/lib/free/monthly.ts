/**
 * 無料診断の月の回数（全員で分け合う 1 つの枠）。サーバー専用。
 *
 * 利用者の決定 2026-10-02: パスワードの代わりに「月に 50 回」のような上限で守る。
 * 回数は無料診断の画面の上とマスター画面に出す（不正利用と、営業がどれだけ使っているかが分かる）。
 *
 * 記録先は **Clerk の運用者（ADMIN_EMAILS の先頭）のアカウントの privateMetadata.freeRuns**（2026-10-03）。
 *   { month: "YYYY-MM", used: n, records: [{ at, k, t, ip }] }（records は新しい順に最大 RECORDS_KEEP 件）
 * 2026-10-02 までは Supabase の usage_events（無ければプロセス内メモリ）だったが、表が未作成のうえ Vercel では
 * 関数ごとにメモリが別なので、「書いた場所と読む場所が違って 0 のまま」になっていた（利用者の報告 10-03
 * 「今月の診断回数がカウントされない」）。Clerk なら追加の設定（SQL）なしで必ず残る。
 * Clerk が無い環境（開発・E2E）だけプロセス内メモリ。
 *
 * 順番: 外部 API を呼ぶ前に checkFreeRun()（上限なら 429）→ 呼べたら recordFreeRun()（**必ず await する**。
 * Vercel は応答を返すと関数を止めるので、投げっぱなしだと書き込みが消える）。
 * 読んで +1 して書く作りなので、同時に押されたときの 1〜2 回の超過は許容する。
 */
import { clerkClient } from "@clerk/nextjs/server";
import { z } from "zod";
import { adminEmails } from "@/lib/admin/config";
import { isOperatorUser } from "@/lib/admin/identity";
import { NO_STORE } from "@/lib/api/headers";
import { isAuthEnabled } from "@/lib/auth/config";
import { jstMonthKey } from "@/lib/time/jst";
import { usageResetsOn } from "@/lib/usage/limits";
import { envInt } from "./ratelimit";
import { FREE_MONTHLY_CODE } from "./session-rules";
import { FREE_MONTHLY_LIMIT_DEFAULT, freeMonthlyLimitMessage, freeRunsOf, isFreeRunKind, type FreeRunKind, type FreeRunRecord, type FreeRuns } from "./monthly-rules";

/** privateMetadata のキー */
export const FREE_RUNS_KEY = "freeRuns";
/** 残す記録の件数（Clerk の metadata は 8KB までなので絞る。回数 used は別に持つので件数を超えても数は正しい） */
export const RECORDS_KEEP = 20;
const TARGET_MAX = 80;

/** 月の上限（環境変数 FREE_MONTHLY_LIMIT。0 で停止） */
export function freeMonthlyLimit(): number {
  return Math.max(0, envInt("FREE_MONTHLY_LIMIT", FREE_MONTHLY_LIMIT_DEFAULT));
}

const StoredSchema = z.object({
  month: z.string(),
  used: z.number().int().nonnegative(),
  records: z.array(z.object({ at: z.string(), k: z.string(), t: z.string(), ip: z.string().nullable() })).default([]),
});
type Stored = z.infer<typeof StoredSchema>;

function emptyStored(month: string): Stored {
  return { month, used: 0, records: [] };
}

/** metadata から今月ぶんを読む。無い・壊れている・月が違えば 0 から */
export function storedFromMetadata(metadata: unknown, month: string): Stored {
  if (typeof metadata !== "object" || metadata === null) return emptyStored(month);
  const parsed = StoredSchema.safeParse((metadata as Record<string, unknown>)[FREE_RUNS_KEY]);
  if (!parsed.success || parsed.data.month !== month) return emptyStored(month);
  return parsed.data;
}

function toRecord(r: Stored["records"][number]): FreeRunRecord | null {
  if (!isFreeRunKind(r.k)) return null;
  return { at: r.at, kind: r.k, target: r.t, ip: r.ip };
}

// ---- 記録先: Clerk の運用者のアカウント
interface Store {
  read(month: string): Promise<Stored>;
  write(next: Stored): Promise<void>;
  source: FreeRuns["source"];
}

let operatorIdCache: { id: string; at: number } | null = null;
const OPERATOR_CACHE_MS = 10 * 60 * 1000;

/** 運用者（ADMIN_EMAILS）のうち、確認済みのメールで最初に見つかった人の Clerk ユーザー ID。見つからなければ null */
async function operatorUserId(): Promise<string | null> {
  if (operatorIdCache && Date.now() - operatorIdCache.at < OPERATOR_CACHE_MS) return operatorIdCache.id;
  const emails = adminEmails();
  if (emails.length === 0) return null;
  const client = await clerkClient();
  const { data } = await client.users.getUserList({ emailAddress: emails, limit: 10 });
  const user = data.find((u) => isOperatorUser(u, emails));
  if (!user) return null;
  operatorIdCache = { id: user.id, at: Date.now() };
  return user.id;
}

/** テスト用: 運用者 ID のキャッシュを消す */
export function resetFreeRunsOperatorCache(): void {
  operatorIdCache = null;
}

function clerkStore(userId: string): Store {
  return {
    source: "clerk",
    async read(month) {
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      return storedFromMetadata(user.privateMetadata, month);
    },
    async write(next) {
      const client = await clerkClient();
      await client.users.updateUserMetadata(userId, { privateMetadata: { [FREE_RUNS_KEY]: next } });
    },
  };
}

// ---- 記録先: メモリ（Clerk が無い開発・E2E。運用者が見つからないときの控え）
function memory(): { stored: Stored | null } {
  const g = globalThis as unknown as { __seo_checker_free_runs?: { stored: Stored | null } };
  g.__seo_checker_free_runs ??= { stored: null };
  return g.__seo_checker_free_runs;
}
/** テスト用 */
export function resetFreeRunsMemory(): void {
  memory().stored = null;
  operatorIdCache = null;
}
const memoryStore: Store = {
  source: "memory",
  async read(month) {
    const m = memory().stored;
    return m && m.month === month ? m : emptyStored(month);
  },
  async write(next) {
    memory().stored = next;
  },
};

let warned = false;
function warnOnce(err: unknown) {
  if (warned) return;
  warned = true;
  console.warn("[free] 無料診断の回数を Clerk に記録できません（メモリで数えます。ADMIN_EMAILS の運用者が Clerk に居るか確認）", err instanceof Error ? err.message : err);
}

async function store(): Promise<Store> {
  if (!isAuthEnabled()) return memoryStore;
  try {
    const id = await operatorUserId();
    if (id) return clerkStore(id);
    warnOnce(new Error("ADMIN_EMAILS の運用者が見つかりません"));
  } catch (err) {
    warnOnce(err);
  }
  return memoryStore;
}

async function readThisMonth(now: Date): Promise<{ month: string; stored: Stored; source: FreeRuns["source"] }> {
  const month = jstMonthKey(now);
  const s = await store();
  try {
    return { month, stored: await s.read(month), source: s.source };
  } catch (err) {
    warnOnce(err);
    return { month, stored: await memoryStore.read(month), source: "memory" };
  }
}

/** 今月の回数（画面の上とマスター画面に出す） */
export async function freeRunsThisMonth(now = new Date()): Promise<FreeRuns> {
  const { month, stored, source } = await readThisMonth(now);
  return freeRunsOf(month, stored.used, freeMonthlyLimit(), usageResetsOn(now), source);
}

/** 今月の回数と記録（マスター画面の一覧用。新しい順に最大 `limit` 件） */
export async function recentFreeRuns(limit = RECORDS_KEEP, now = new Date()): Promise<{ runs: FreeRuns; records: FreeRunRecord[] }> {
  const { month, stored, source } = await readThisMonth(now);
  return {
    runs: freeRunsOf(month, stored.used, freeMonthlyLimit(), usageResetsOn(now), source),
    records: stored.records.map(toRecord).filter((r): r is FreeRunRecord => r !== null).slice(0, limit),
  };
}

/** 上限内なら null、達していれば 429 の Response（記録はしない） */
export async function checkFreeRun(now = new Date()): Promise<Response | null> {
  const runs = await freeRunsThisMonth(now);
  if (runs.remaining > 0) return null;
  return Response.json({ error: freeMonthlyLimitMessage(runs), code: FREE_MONTHLY_CODE, runs }, { status: 429, headers: NO_STORE });
}

/** 1 回ぶん記録する（外部 API を実際に呼んだあと。失敗しても診断は止めない。必ず await すること） */
export async function recordFreeRun(kind: FreeRunKind, target: string, ip: string | null, now = new Date()): Promise<void> {
  const month = jstMonthKey(now);
  const record = { at: now.toISOString(), k: kind, t: target.slice(0, TARGET_MAX), ip };
  const s = await store();
  try {
    const current = await s.read(month);
    await s.write({ month, used: current.used + 1, records: [record, ...current.records].slice(0, RECORDS_KEEP) });
  } catch (err) {
    warnOnce(err);
    const current = await memoryStore.read(month);
    await memoryStore.write({ month, used: current.used + 1, records: [record, ...current.records].slice(0, RECORDS_KEEP) });
  }
}
