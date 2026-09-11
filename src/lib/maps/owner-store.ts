/**
 * オーナー申告の保存（Supabase の meo_owner_inputs テーブル）。サーバー専用。
 *
 * 利用者 × 自社店舗ごとに 1 行（主キー user_id, place_id）。競合には無い。
 * 行は必ず user_id で絞る（service_role は RLS を素通りするため、ここが唯一の境界）。
 * テーブル定義は docs/dev/OPERATIONS.md の SQL を参照。
 */
import { z } from "zod";
import { supabaseRest } from "@/lib/db/supabase";
import { MeoOwnerInputSchema, type MeoOwnerData, type MeoOwnerInput } from "./owner-input";

const TABLE = "meo_owner_inputs";
const COLUMNS = "user_id,place_id,input,updated_at";

const RowSchema = z.object({
  user_id: z.string(),
  place_id: z.string(),
  input: z.unknown(),
  updated_at: z.string(),
});

function eq(value: string): string {
  return `eq.${encodeURIComponent(value)}`;
}

/** 行 → 申告。入力の形が壊れていれば null（保存したのは自分のサーバーだが、念のため検証する） */
export function fromOwnerRow(row: { input: unknown; updated_at: string }): MeoOwnerData | null {
  const parsed = MeoOwnerInputSchema.safeParse(row.input);
  if (!parsed.success) return null;
  return { input: parsed.data, updatedAt: row.updated_at };
}

/** 1 件（無ければ null） */
export async function getOwnerInput(userId: string, placeId: string): Promise<MeoOwnerData | null> {
  const rows = await supabaseRest<unknown>(`${TABLE}?select=${COLUMNS}&user_id=${eq(userId)}&place_id=${eq(placeId)}&limit=1`);
  const parsed = z.array(RowSchema).safeParse(rows);
  if (!parsed.success) throw new Error("オーナー申告の応答を読めませんでした");
  const row = parsed.data[0];
  return row ? fromOwnerRow(row) : null;
}

/** 一斉更新用: 失敗しても更新自体は止めない（申告なしとして採点する） */
export async function getOwnerInputOrNull(userId: string, placeId: string): Promise<MeoOwnerData | null> {
  try {
    return await getOwnerInput(userId, placeId);
  } catch (err) {
    console.error("[maps] オーナー申告の読み込みに失敗", { userId, placeId, err });
    return null;
  }
}

/** 保存（上書き）。保存後の申告を返す */
export async function putOwnerInput(userId: string, placeId: string, input: MeoOwnerInput, at = new Date()): Promise<MeoOwnerData> {
  const rows = await supabaseRest<unknown>(`${TABLE}?select=${COLUMNS}&on_conflict=user_id,place_id`, {
    method: "POST",
    body: { user_id: userId, place_id: placeId, input, updated_at: at.toISOString() },
    prefer: "return=representation,resolution=merge-duplicates",
  });
  const parsed = z.array(RowSchema).min(1).safeParse(rows);
  if (!parsed.success) throw new Error("保存後の応答を読めませんでした");
  const data = fromOwnerRow(parsed.data[0]);
  if (!data) throw new Error("保存した申告を読めませんでした");
  return data;
}

/** 消せたら true */
export async function deleteOwnerInput(userId: string, placeId: string): Promise<boolean> {
  const rows = await supabaseRest<unknown>(`${TABLE}?select=place_id&user_id=${eq(userId)}&place_id=${eq(placeId)}`, {
    method: "DELETE",
    prefer: "return=representation",
  });
  return Array.isArray(rows) && rows.length > 0;
}
