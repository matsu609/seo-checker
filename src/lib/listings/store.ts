/**
 * 基本情報掲載の保存（Supabase の listing_profiles テーブル）。サーバー専用。
 *
 * 利用者 × 自社店舗（Place ID）ごとに 1 行（主キー user_id, place_id）。
 * 行は必ず user_id で絞る（service_role は RLS を素通りするため、ここが唯一の境界）。
 * テーブル定義は docs/dev/OPERATIONS.md の SQL（r39）を参照。
 */
import { z } from "zod";
import { supabaseRest } from "@/lib/db/supabase";
import { ListingProfileSchema, ListingStatesSchema, type ListingProfile, type ListingStates } from "./profile";

const TABLE = "listing_profiles";
const COLUMNS = "user_id,place_id,profile,states,updated_at";

const RowSchema = z.object({
  user_id: z.string(),
  place_id: z.string(),
  profile: z.unknown(),
  states: z.unknown(),
  updated_at: z.string(),
});

export interface ListingRecord {
  placeId: string;
  profile: ListingProfile;
  states: ListingStates;
  updatedAt: string;
}

function eq(value: string): string {
  return `eq.${encodeURIComponent(value)}`;
}

/** 行 → 記録。壊れた部分は既定値に落とす（保存したのは自分のサーバー） */
export function fromListingRow(row: { place_id: string; profile: unknown; states: unknown; updated_at: string }): ListingRecord {
  const profile = ListingProfileSchema.safeParse(row.profile ?? {});
  const states = ListingStatesSchema.safeParse(row.states ?? {});
  return {
    placeId: row.place_id,
    profile: profile.success ? profile.data : ListingProfileSchema.parse({}),
    states: states.success ? states.data : {},
    updatedAt: row.updated_at,
  };
}

function parseRows(rows: unknown): ListingRecord[] {
  const parsed = z.array(RowSchema).safeParse(rows);
  if (!parsed.success) throw new Error("基本情報の応答を読めませんでした");
  return parsed.data.map(fromListingRow);
}

export async function listListings(userId: string): Promise<ListingRecord[]> {
  return parseRows(await supabaseRest<unknown>(`${TABLE}?select=${COLUMNS}&user_id=${eq(userId)}&order=updated_at.desc&limit=200`));
}

export async function getListing(userId: string, placeId: string): Promise<ListingRecord | null> {
  const rows = await supabaseRest<unknown>(`${TABLE}?select=${COLUMNS}&user_id=${eq(userId)}&place_id=${eq(placeId)}&limit=1`);
  return parseRows(rows)[0] ?? null;
}

/** 保存（上書き）。保存後の記録を返す */
export async function putListing(userId: string, placeId: string, profile: ListingProfile, states: ListingStates, at = new Date()): Promise<ListingRecord> {
  const rows = await supabaseRest<unknown>(`${TABLE}?select=${COLUMNS}&on_conflict=user_id,place_id`, {
    method: "POST",
    body: { user_id: userId, place_id: placeId, profile, states, updated_at: at.toISOString() },
    prefer: "return=representation,resolution=merge-duplicates",
  });
  const r = parseRows(rows)[0];
  if (!r) throw new Error("保存後の応答を読めませんでした");
  return r;
}
