/**
 * 投稿の保存（Supabase の gbp_posts テーブル）。サーバー専用。行は必ず user_id で絞る。
 *
 * SQL（Supabase SQL Editor で 1 回）:
 *   create table if not exists gbp_posts (
 *     id uuid primary key default gen_random_uuid(),
 *     user_id text not null,
 *     place_id text not null,
 *     location_name text,
 *     topic_type text not null default 'STANDARD',
 *     title text not null default '',
 *     summary text not null default '',
 *     cta_type text not null default 'NONE',
 *     cta_url text not null default '',
 *     event_start date,
 *     event_end date,
 *     status text not null default 'draft',
 *     scheduled_at timestamptz,
 *     published_at timestamptz,
 *     google_name text,
 *     error text,
 *     created_at timestamptz not null default now(),
 *     updated_at timestamptz not null default now()
 *   );
 *   create index if not exists gbp_posts_user_idx on gbp_posts (user_id, place_id, created_at desc);
 *   create index if not exists gbp_posts_due_idx on gbp_posts (status, scheduled_at);
 *   alter table gbp_posts enable row level security;
 */
import { z } from "zod";
import { eq, gte, lt, lte } from "@/lib/db/filters";
import { supabaseCount, supabaseRest } from "@/lib/db/supabase";
import { CTA_TYPES, POST_STATUSES, POST_TOPICS, type GbpPost, type PostInput } from "./types";

const TABLE = "gbp_posts";
const COLUMNS = "id,user_id,place_id,location_name,topic_type,title,summary,cta_type,cta_url,event_start,event_end,status,scheduled_at,published_at,google_name,error,created_at,updated_at";
export const POSTS_LIMIT = 200;

const RowSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  place_id: z.string(),
  location_name: z.string().nullable(),
  topic_type: z.enum(POST_TOPICS).catch("STANDARD"),
  title: z.string(),
  summary: z.string(),
  cta_type: z.enum(CTA_TYPES).catch("NONE"),
  cta_url: z.string(),
  event_start: z.string().nullable(),
  event_end: z.string().nullable(),
  status: z.enum(POST_STATUSES).catch("draft"),
  scheduled_at: z.string().nullable(),
  published_at: z.string().nullable(),
  google_name: z.string().nullable(),
  error: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export type PostRow = z.infer<typeof RowSchema>;

export function fromPostRow(row: PostRow): GbpPost & { userId: string } {
  return {
    id: row.id,
    userId: row.user_id,
    placeId: row.place_id,
    locationName: row.location_name,
    topicType: row.topic_type,
    title: row.title,
    summary: row.summary,
    ctaType: row.cta_type,
    ctaUrl: row.cta_url,
    eventStart: row.event_start,
    eventEnd: row.event_end,
    status: row.status,
    scheduledAt: row.scheduled_at,
    publishedAt: row.published_at,
    googleName: row.google_name,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function parseRows(rows: unknown): (GbpPost & { userId: string })[] {
  const parsed = z.array(RowSchema).safeParse(rows);
  if (!parsed.success) throw new Error("投稿の応答を読めませんでした");
  return parsed.data.map(fromPostRow);
}

function toBody(input: Partial<PostInput> & { status?: GbpPost["status"] }): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (input.topicType !== undefined) body.topic_type = input.topicType;
  if (input.title !== undefined) body.title = input.title;
  if (input.summary !== undefined) body.summary = input.summary;
  if (input.ctaType !== undefined) body.cta_type = input.ctaType;
  if (input.ctaUrl !== undefined) body.cta_url = input.ctaUrl;
  if (input.eventStart !== undefined) body.event_start = input.eventStart;
  if (input.eventEnd !== undefined) body.event_end = input.eventEnd;
  if (input.scheduledAt !== undefined) body.scheduled_at = input.scheduledAt;
  if (input.status !== undefined) body.status = input.status;
  return body;
}

export async function listPosts(userId: string, placeId?: string): Promise<GbpPost[]> {
  const filter = placeId ? `&place_id=${eq(placeId)}` : "";
  return parseRows(await supabaseRest<unknown>(`${TABLE}?select=${COLUMNS}&user_id=${eq(userId)}${filter}&order=created_at.desc&limit=${POSTS_LIMIT}`));
}

export async function getPost(userId: string, id: string): Promise<GbpPost | null> {
  return parseRows(await supabaseRest<unknown>(`${TABLE}?select=${COLUMNS}&user_id=${eq(userId)}&id=${eq(id)}&limit=1`))[0] ?? null;
}

export async function insertPosts(userId: string, placeId: string, inputs: readonly (PostInput & { status?: GbpPost["status"] })[], at = new Date()): Promise<GbpPost[]> {
  if (inputs.length === 0) return [];
  return parseRows(
    await supabaseRest<unknown>(`${TABLE}?select=${COLUMNS}`, {
      method: "POST",
      body: inputs.map((i) => ({ user_id: userId, place_id: placeId, ...toBody(i), status: i.status ?? "draft", created_at: at.toISOString(), updated_at: at.toISOString() })),
      prefer: "return=representation",
    }),
  );
}

export interface PostPatch extends Partial<PostInput> {
  status?: GbpPost["status"];
  locationName?: string | null;
  publishedAt?: string | null;
  googleName?: string | null;
  error?: string | null;
}

export async function updatePost(userId: string, id: string, patch: PostPatch, at = new Date()): Promise<GbpPost | null> {
  const body = { ...toBody(patch), updated_at: at.toISOString() } as Record<string, unknown>;
  if (patch.locationName !== undefined) body.location_name = patch.locationName;
  if (patch.publishedAt !== undefined) body.published_at = patch.publishedAt;
  if (patch.googleName !== undefined) body.google_name = patch.googleName;
  if (patch.error !== undefined) body.error = patch.error;
  const rows = await supabaseRest<unknown>(`${TABLE}?select=${COLUMNS}&user_id=${eq(userId)}&id=${eq(id)}`, { method: "PATCH", body, prefer: "return=representation" });
  return parseRows(rows)[0] ?? null;
}

export async function deletePost(userId: string, id: string): Promise<void> {
  await supabaseRest<unknown>(`${TABLE}?user_id=${eq(userId)}&id=${eq(id)}`, { method: "DELETE", prefer: "return=minimal" });
}

/** 予定時刻を過ぎた予約済みの投稿（全利用者。定期処理だけが使う） */
export async function listDuePosts(now: Date, limit = 200): Promise<(GbpPost & { userId: string })[]> {
  return parseRows(
    await supabaseRest<unknown>(`${TABLE}?select=${COLUMNS}&status=eq.scheduled&scheduled_at=${lte(now.toISOString())}&order=scheduled_at.asc&limit=${limit}`),
  );
}

/**
 * ある期間に投稿できた件数（月次レポート用）。
 * 件数はデータベースに数えさせる（行を受け取って数えると 1,000 件で黙って頭打ちになる。2026-09-23）
 */
export async function countPublishedBetween(userId: string, startIso: string, endIso: string): Promise<number> {
  return supabaseCount(`${TABLE}?select=id&user_id=${eq(userId)}&status=eq.published&published_at=${gte(startIso)}&published_at=${lt(endIso)}`);
}

/** 予約済みの投稿の数（月次レポートの「来月やること」用） */
export async function countScheduled(userId: string): Promise<number> {
  return supabaseCount(`${TABLE}?select=id&user_id=${eq(userId)}&status=eq.scheduled`);
}
