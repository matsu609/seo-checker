/**
 * ブラウザ側ストア（src/lib/store/createStore.ts）のサーバー側の写し。サーバー専用。
 *
 * テーブル user_stores（user_id, name, value jsonb）。ストア名ごとに 1 行。
 * 目的は 2 つ: ①運用者の代理ログインで、お客様が登録・実行したもの（ホームページ・順位計測の履歴・
 * 診断の履歴・下書きなど）をそのまま見られるようにする（利用者の指示 2026-09-18）。
 * ②お客様が別の PC・ブラウザからログインしても同じデータが出る。
 *
 * 同期のルールはクライアント側（src/lib/store/sync-rules.ts / StoreSync.tsx）。ここは読み書きだけ。
 *
 * SQL（Supabase SQL Editor で 1 回実行）:
 *   create table if not exists user_stores (
 *     user_id text not null,
 *     name text not null,
 *     value jsonb not null,
 *     updated_at timestamptz not null default now(),
 *     primary key (user_id, name)
 *   );
 *   alter table user_stores enable row level security;
 */
import { z } from "zod";
import { supabaseRest } from "./supabase";

const TABLE = "user_stores";

const RowSchema = z.object({ name: z.string(), value: z.unknown() });

/** そのユーザーの全ストア（name → value） */
export async function listUserStores(userId: string): Promise<Record<string, unknown>> {
  const rows = await supabaseRest<unknown>(`${TABLE}?select=name,value&user_id=eq.${encodeURIComponent(userId)}`);
  const parsed = z.array(RowSchema).safeParse(rows);
  const out: Record<string, unknown> = {};
  if (!parsed.success) return out;
  for (const row of parsed.data) out[row.name] = row.value;
  return out;
}

/** 1 ストアを保存（あれば置き換え） */
export async function saveUserStore(userId: string, name: string, value: unknown): Promise<void> {
  await supabaseRest<unknown>(`${TABLE}?on_conflict=user_id,name`, {
    method: "POST",
    body: [{ user_id: userId, name, value, updated_at: new Date().toISOString() }],
    prefer: "return=minimal,resolution=merge-duplicates",
  });
}

/** 1 ストアを削除（初期値に戻した = サーバーにも残さない） */
export async function removeUserStore(userId: string, name: string): Promise<void> {
  await supabaseRest<unknown>(`${TABLE}?user_id=eq.${encodeURIComponent(userId)}&name=eq.${encodeURIComponent(name)}`, {
    method: "DELETE",
    prefer: "return=minimal",
  });
}

/** 1 ストアの値（無ければ undefined）。Cron が利用者ごとの設定を読むときに使う（全ストアを読まない） */
export async function getUserStore(userId: string, name: string): Promise<unknown> {
  const rows = await supabaseRest<unknown>(
    `${TABLE}?select=value&user_id=eq.${encodeURIComponent(userId)}&name=eq.${encodeURIComponent(name)}&limit=1`,
  );
  const parsed = z.array(z.object({ value: z.unknown() })).safeParse(rows);
  if (!parsed.success || parsed.data.length === 0) return undefined;
  return parsed.data[0].value;
}

/** あるストアを持つ利用者の一覧（user_id と値）。定期処理が「対象の利用者」を集めるときに使う */
export async function listStoreValues(name: string, limit = 1000): Promise<{ userId: string; value: unknown }[]> {
  const rows = await supabaseRest<unknown>(
    `${TABLE}?select=user_id,value&name=eq.${encodeURIComponent(name)}&order=updated_at.desc&limit=${limit}`,
  );
  const parsed = z.array(z.object({ user_id: z.string(), value: z.unknown() })).safeParse(rows);
  if (!parsed.success) return [];
  return parsed.data.map((r) => ({ userId: r.user_id, value: r.value }));
}
