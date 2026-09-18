/**
 * 無料診断の回数を数えて止める。サーバー専用。
 *
 * 利用者（見込み客）は登録したメールアドレス = Clerk のユーザーごとに FREE_DIAGNOSIS_LIMIT 回（既定 2）。
 * 回数は Clerk の privateMetadata.freeRuns（サーバーだけが書ける）。厳密な排他は無いが、
 * 2 回の制限を数倍すり抜ける事故は起きない（同時に押しても 1 回ぶんの取りこぼしまで）。
 *
 * 回数制限が無いのは 2 つ: 認証が無効な環境（開発・E2E）、契約済み（plan が free 以外。
 * 契約済みはそもそも無料診断の画面に入れないが、API を直接叩いた場合も止めない）。
 * 運用者（ADMIN_EMAILS）と代理店は「デモ用」として月 FREE_DEMO_LIMIT 回（既定 50。privateMetadata.demoRuns）。
 */
import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { currentAgencyId, isAdmin } from "@/lib/admin/guard";
import { isAuthEnabled } from "@/lib/auth/config";
import { getCurrentPlan } from "@/lib/plans/current";
import { envInt } from "./ratelimit";
import { DEMO_RUN_LIMIT_DEFAULT, DEMO_RUNS_KEY, demoQuotaOf, demoRunsFromMetadata, FREE_QUOTA_MESSAGE, FREE_RUN_LIMIT_DEFAULT, FREE_RUNS_KEY, freeRunsFromMetadata, monthKey, quotaOf, unlimitedQuota, type FreeQuota } from "./quota-rules";

const NO_STORE = { "cache-control": "no-store" } as const;

export function freeRunLimit(): number {
  return envInt("FREE_DIAGNOSIS_LIMIT", FREE_RUN_LIMIT_DEFAULT);
}

/** 運用者・代理店のデモ用の枠（月あたり） */
export function demoRunLimit(): number {
  return envInt("FREE_DEMO_LIMIT", DEMO_RUN_LIMIT_DEFAULT);
}

/** 運用者か代理店か（デモ用の枠を使う人） */
async function isDemoUser(): Promise<boolean> {
  if (await isAdmin()) return true;
  return (await currentAgencyId()) !== null;
}

/** ログインしていなければ 401（画面は登録へ誘導する）。通れば null */
export async function requireFreeUser(): Promise<Response | null> {
  if (!isAuthEnabled()) return null;
  const { userId } = await auth();
  if (userId) return null;
  return Response.json({ error: "無料診断はアカウント登録（無料）のあとにご利用いただけます。", code: "sign_in" }, { status: 401, headers: NO_STORE });
}

/** いまのユーザーの残り回数。未ログインなら null */
export async function getFreeQuota(): Promise<FreeQuota | null> {
  const limit = freeRunLimit();
  if (!isAuthEnabled()) return unlimitedQuota("auth-disabled", limit);
  const { userId } = await auth();
  if (!userId) return null;
  const user = await currentUser();
  if (await isDemoUser()) return demoQuotaOf(demoRunsFromMetadata(user?.privateMetadata, monthKey()), demoRunLimit());
  const { plan } = await getCurrentPlan();
  if (plan !== "free") return unlimitedQuota("paid", limit);
  return quotaOf(freeRunsFromMetadata(user?.privateMetadata), limit);
}

/**
 * 1 回ぶん消費する。未ログインなら 401、使い切っていれば 402 の Response を返す。通れば null。
 * 呼び出し側は、キャッシュに当たった（費用の出ない）診断では呼ばない。
 */
export async function consumeFreeRun(): Promise<Response | null> {
  const denied = await requireFreeUser();
  if (denied) return denied;
  const quota = await getFreeQuota();
  if (!quota) return Response.json({ error: "ログインが必要です", code: "sign_in" }, { status: 401, headers: NO_STORE });
  if (quota.unlimited) return null;
  if (quota.remaining <= 0) {
    return Response.json({ error: FREE_QUOTA_MESSAGE, code: "quota", quota }, { status: 402, headers: NO_STORE });
  }
  const { userId } = await auth();
  if (!userId) return Response.json({ error: "ログインが必要です", code: "sign_in" }, { status: 401, headers: NO_STORE });
  const client = await clerkClient();
  if (quota.reason === "demo") {
    await client.users.updateUserMetadata(userId, { privateMetadata: { [DEMO_RUNS_KEY]: { month: monthKey(), used: quota.used + 1 } } });
  } else {
    await client.users.updateUserMetadata(userId, { privateMetadata: { [FREE_RUNS_KEY]: quota.used + 1 } });
  }
  return null;
}
