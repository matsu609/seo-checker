/**
 * カルテを「いま処理しているお客様の文脈」としてプロンプトに渡すための入口。サーバー専用。
 *
 * 各 API ルートはこの 1 行だけを呼ぶ:
 * ```ts
 * const brief = await currentKarteBrief();   // 失敗しても "" が返る
 * ```
 *
 * **絶対に機能を止めない。**カルテはあれば文章が良くなるだけの材料なので、
 * テーブルが無い・Supabase 未設定・Clerk が落ちている、のどれでも空文字を返して先へ進む。
 * 同じ人のカルテを 1 回の操作で何度も読まないよう、短い時間だけ覚えておく。
 */
import { currentUser } from "@clerk/nextjs/server";
import { isAuthEnabled } from "@/lib/auth/config";
import { currentUserId } from "@/lib/auth/user";
import { globalCache } from "@/lib/cache";
import { isSupabaseConfigured } from "@/lib/db/supabase";
import { leadFromMetadata, type LeadProfile } from "@/lib/free/lead";
import { karteBrief } from "./summary";
import { getKarte } from "./store";

/** 保存のあと数分で反映されればよい（プロンプトの材料なので即時性は要らない） */
const TTL_MS = 3 * 60 * 1000;
const cache = globalCache<string>("karteBrief", TTL_MS, 200);

/** ログイン中の本人の登録情報（無ければ null） */
async function currentLead(): Promise<LeadProfile | null> {
  if (!isAuthEnabled()) return null;
  try {
    const user = await currentUser();
    return user ? leadFromMetadata(user.publicMetadata, user.unsafeMetadata) : null;
  } catch {
    return null;
  }
}

/**
 * ログイン中の本人のカルテを、プロンプトに差し込める文章にして返す。
 * 未記入・未設定・エラーのときは空文字。
 */
export async function currentKarteBrief(): Promise<string> {
  if (!isSupabaseConfigured()) return "";
  let userId: string | null;
  try {
    userId = await currentUserId();
  } catch {
    return "";
  }
  if (!userId) return "";

  const hit = cache.get(userId);
  if (hit !== undefined) return hit;

  let brief = "";
  try {
    const [record, lead] = await Promise.all([getKarte(userId), currentLead()]);
    brief = karteBrief({
      answers: record.answers,
      storeType: lead?.storeType ?? null,
      company: lead?.company ?? record.company,
      region: lead?.region ?? "",
    });
  } catch {
    // テーブルがまだ無い・DB が落ちている。文章の質が少し落ちるだけなので黙って続ける
    brief = "";
  }
  cache.set(userId, brief);
  return brief;
}

/** 保存したらすぐ次の生成に反映されるように、覚えている分を捨てる */
export function forgetKarteBrief(userId: string): void {
  cache.delete(userId);
}
