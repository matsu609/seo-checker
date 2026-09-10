/**
 * 登録した店舗（自社・競合）の一覧。Supabase の meo_stores テーブル。サーバー専用。
 *
 * 一斉更新（週 1 回）はサーバーが動かすので、店舗の一覧はブラウザではなく
 * サーバー側に持つ。行は必ず user_id で絞る（service_role は RLS を素通りする）。
 *
 * 自社の店舗は own_place_id = ""、競合はその自社店舗の Place ID を own_place_id に持つ。
 * テーブル定義は docs/dev/OPERATIONS.md の SQL を参照。
 */
import { z } from "zod";
import { supabaseRest } from "@/lib/db/supabase";
import { MAX_COMPETITORS } from "./types";

/** 1 利用者が登録できる自社店舗の上限（代行会社の利用を想定） */
export const MAX_OWN_STORES = 200;
/** 競合の上限は比較表の上限と同じ（自社 1 件あたり） */
export const MAX_COMPETITORS_PER_STORE = MAX_COMPETITORS;

export type StoreRole = "own" | "competitor";

export interface MeoStore {
  id: string;
  placeId: string;
  name: string;
  role: StoreRole;
  /** 競合のとき、紐づく自社店舗の Place ID。自社なら "" */
  ownPlaceId: string;
  createdAt: string;
  lastRefreshedAt: string | null;
}

const TABLE = "meo_stores";
const COLUMNS = "id,user_id,place_id,place_name,own_place_id,created_at,last_refreshed_at";

const RowSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  place_id: z.string(),
  place_name: z.string(),
  own_place_id: z.string(),
  created_at: z.string(),
  last_refreshed_at: z.string().nullable(),
});
export type MeoStoreRow = z.infer<typeof RowSchema>;

export function fromStoreRow(row: MeoStoreRow): MeoStore {
  return {
    id: row.id,
    placeId: row.place_id,
    name: row.place_name,
    role: row.own_place_id === "" ? "own" : "competitor",
    ownPlaceId: row.own_place_id,
    createdAt: row.created_at,
    lastRefreshedAt: row.last_refreshed_at,
  };
}

function eq(value: string): string {
  return `eq.${encodeURIComponent(value)}`;
}

function parseRows(rows: unknown): MeoStoreRow[] {
  const parsed = z.array(RowSchema).safeParse(rows);
  if (!parsed.success) throw new Error("店舗一覧の応答を読めませんでした");
  return parsed.data;
}

/** 利用者の登録店舗（自社 → 競合の順、古い順） */
export async function listStores(userId: string): Promise<MeoStore[]> {
  const rows = await supabaseRest<unknown>(
    `${TABLE}?select=${COLUMNS}&user_id=${eq(userId)}&order=own_place_id.asc,created_at.asc&limit=${MAX_OWN_STORES * (1 + MAX_COMPETITORS_PER_STORE)}`,
  );
  return parseRows(rows).map(fromStoreRow);
}

export interface NewStore {
  placeId: string;
  name: string;
  /** 競合なら紐づける自社の Place ID */
  ownPlaceId: string;
}

/** 登録（同じ店舗の二重登録は既存の行を返す） */
export async function addStore(userId: string, input: NewStore): Promise<MeoStore> {
  const rows = await supabaseRest<unknown>(`${TABLE}?select=${COLUMNS}&on_conflict=user_id,place_id,own_place_id`, {
    method: "POST",
    body: { user_id: userId, place_id: input.placeId, place_name: input.name, own_place_id: input.ownPlaceId },
    prefer: "return=representation,resolution=merge-duplicates",
  });
  const row = parseRows(rows)[0];
  if (!row) throw new Error("登録後の応答を読めませんでした");
  return fromStoreRow(row);
}

/** 1 件（他人の行や無い行は null） */
export async function getStore(userId: string, id: string): Promise<MeoStore | null> {
  const rows = await supabaseRest<unknown>(`${TABLE}?select=${COLUMNS}&user_id=${eq(userId)}&id=${eq(id)}&limit=1`);
  const row = parseRows(rows)[0];
  return row ? fromStoreRow(row) : null;
}

/**
 * 削除。自社の店舗を消すときは、その競合もまとめて消す。
 * 消せた行数を返す（0 なら他人の行か無い行）。
 */
export async function removeStore(userId: string, id: string): Promise<number> {
  const store = await getStore(userId, id);
  if (!store) return 0;
  const rows = await supabaseRest<unknown>(`${TABLE}?select=id&user_id=${eq(userId)}&id=${eq(id)}`, {
    method: "DELETE",
    prefer: "return=representation",
  });
  let count = Array.isArray(rows) ? rows.length : 0;
  if (store.role === "own") {
    const children = await supabaseRest<unknown>(
      `${TABLE}?select=id&user_id=${eq(userId)}&own_place_id=${eq(store.placeId)}`,
      { method: "DELETE", prefer: "return=representation" },
    );
    count += Array.isArray(children) ? children.length : 0;
  }
  return count;
}

/** 一斉更新の対象（全利用者）。更新が古い順。同じ店舗が複数の利用者に登録されていれば複数行返る */
export async function listStoresDue(limit: number): Promise<MeoStoreRow[]> {
  const rows = await supabaseRest<unknown>(
    `${TABLE}?select=${COLUMNS}&order=last_refreshed_at.asc.nullsfirst,created_at.asc&limit=${limit}`,
  );
  return parseRows(rows);
}

/** 更新日時を書き込む（同じ店舗の全行） */
export async function markRefreshed(placeId: string, at: Date): Promise<void> {
  await supabaseRest(`${TABLE}?place_id=${eq(placeId)}`, {
    method: "PATCH",
    body: { last_refreshed_at: at.toISOString() },
    prefer: "return=minimal",
  });
}
