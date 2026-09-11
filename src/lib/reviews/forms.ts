/**
 * アンケート（review_forms）と QR の発行単位（review_channels）。Supabase。サーバー専用。
 *
 * 行は必ず user_id で絞る（service_role は RLS を素通りするため、ここが唯一の境界）。
 * 来店客向けの公開 API だけは slug で引く（getPublicForm。active な行だけ、user_id は返さない）。
 * テーブル定義は docs/dev/OPERATIONS.md の SQL を参照。
 */
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { supabaseRest } from "@/lib/db/supabase";
import {
  MAX_CHANNELS,
  QuestionsSchema,
  ReviewFormSettingsSchema,
  type ReviewFormSettings,
  type ReviewQuestion,
} from "./questions";

export const MAX_FORMS = 200;

export interface ReviewForm {
  id: string;
  slug: string;
  title: string;
  storeName: string;
  /** Google マップの Place ID（無ければ null。投稿ボタンは writeReviewUrl があれば出る） */
  placeId: string | null;
  /** Google マップの口コミ投稿画面の URL（無ければ投稿ボタンを出さない） */
  writeReviewUrl: string | null;
  questions: ReviewQuestion[];
  settings: ReviewFormSettings;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * QR の発行単位。店舗を紐づけると（storeName / placeId / writeReviewUrl）、その QR から開いた
 * 来店客の画面はその店舗名になり、投稿ボタンはその店舗の Google マップに飛ぶ。
 * 紐づけが無ければアンケート本体の店舗（storeName / writeReviewUrl）を使う。
 */
export interface ReviewChannel {
  id: string;
  formId: string;
  /** QR に埋める ?c= の値（6 文字） */
  code: string;
  /** 置き場所や担当（テーブル 3、レジ など）。店舗を紐づけただけなら店名と同じ */
  label: string;
  storeName: string | null;
  placeId: string | null;
  writeReviewUrl: string | null;
  createdAt: string;
}

/** 来店客に返す形（店舗の設定のうち、画面に要るものだけ） */
export interface PublicReviewForm {
  slug: string;
  title: string;
  storeName: string;
  questions: ReviewQuestion[];
  lowRatingMax: number;
  hasWriteReviewUrl: boolean;
}

const FORMS = "review_forms";
const FORM_COLUMNS = "id,user_id,slug,title,store_name,place_id,write_review_url,questions,settings,active,created_at,updated_at";
const CHANNELS = "review_channels";
const CHANNEL_COLUMNS = "id,form_id,code,label,store_name,place_id,write_review_url,created_at";

const FormRowSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  slug: z.string(),
  title: z.string(),
  store_name: z.string(),
  place_id: z.string().nullable(),
  write_review_url: z.string().nullable(),
  questions: z.unknown(),
  settings: z.unknown(),
  active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type ReviewFormRow = z.infer<typeof FormRowSchema>;

const ChannelRowSchema = z.object({
  id: z.string(),
  form_id: z.string(),
  code: z.string(),
  label: z.string(),
  store_name: z.string().nullable().optional(),
  place_id: z.string().nullable().optional(),
  write_review_url: z.string().nullable().optional(),
  created_at: z.string(),
});
export type ReviewChannelRow = z.infer<typeof ChannelRowSchema>;

function eq(value: string): string {
  return `eq.${encodeURIComponent(value)}`;
}

/** 行 → アンケート。質問や設定の形が壊れていれば例外（保存したのは自分のサーバー） */
export function fromFormRow(row: ReviewFormRow): ReviewForm {
  const questions = QuestionsSchema.safeParse(row.questions);
  const settings = ReviewFormSettingsSchema.safeParse(row.settings ?? {});
  if (!questions.success || !settings.success) throw new Error("アンケートの保存内容を読めませんでした");
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    storeName: row.store_name,
    placeId: row.place_id,
    writeReviewUrl: row.write_review_url,
    questions: questions.data,
    settings: settings.data,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function fromChannelRow(row: ReviewChannelRow): ReviewChannel {
  return {
    id: row.id,
    formId: row.form_id,
    code: row.code,
    label: row.label,
    storeName: row.store_name ?? null,
    placeId: row.place_id ?? null,
    writeReviewUrl: row.write_review_url ?? null,
    createdAt: row.created_at,
  };
}

/** QR に紐づく店舗（無ければアンケート本体の店舗）。来店客の画面・下書き・投稿先はこれで決まる */
export function resolveStore(form: Pick<ReviewForm, "storeName" | "writeReviewUrl">, channel: ReviewChannel | null): { storeName: string; writeReviewUrl: string | null } {
  if (channel?.storeName) {
    return { storeName: channel.storeName, writeReviewUrl: channel.writeReviewUrl ?? form.writeReviewUrl };
  }
  return { storeName: form.storeName, writeReviewUrl: form.writeReviewUrl };
}

/** 一覧・集計・CSV に出す QR の名前。店舗つきなら「店名（ラベル）」、店名とラベルが同じなら店名だけ */
export function channelDisplayName(channel: Pick<ReviewChannel, "label" | "storeName">): string {
  if (!channel.storeName || channel.storeName === channel.label) return channel.storeName ?? channel.label;
  return `${channel.storeName}（${channel.label}）`;
}

export function toPublicForm(form: ReviewForm, channel: ReviewChannel | null = null): PublicReviewForm {
  const store = resolveStore(form, channel);
  return {
    slug: form.slug,
    title: form.title,
    storeName: store.storeName,
    questions: form.questions,
    lowRatingMax: form.settings.lowRatingMax,
    hasWriteReviewUrl: store.writeReviewUrl !== null,
  };
}

/** URL 用の slug（12 文字、URL セーフ） */
export function newSlug(bytes: (n: number) => Buffer = randomBytes): string {
  return bytes(9).toString("base64url").slice(0, 12);
}

/** QR の発行単位のコード（6 文字。紛らわしい文字を除いた英数字） */
const CODE_CHARS = "abcdefghjkmnpqrstuvwxyz23456789";
export function newChannelCode(random: () => number = Math.random): string {
  let out = "";
  for (let i = 0; i < 6; i += 1) out += CODE_CHARS[Math.floor(random() * CODE_CHARS.length)];
  return out;
}

const SLUG = /^[A-Za-z0-9_-]{8,16}$/;
export function isValidSlug(slug: string): boolean {
  return SLUG.test(slug);
}
const CODE = /^[a-z0-9]{4,8}$/;
export function isValidChannelCode(code: string): boolean {
  return CODE.test(code);
}

/** Place ID から Google マップの口コミ投稿画面の URL */
export function writeReviewUrlFor(placeId: string): string {
  return `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`;
}

function parseForms(rows: unknown): ReviewForm[] {
  const parsed = z.array(FormRowSchema).safeParse(rows);
  if (!parsed.success) throw new Error("アンケート一覧の応答を読めませんでした");
  return parsed.data.map(fromFormRow);
}

function parseChannels(rows: unknown): ReviewChannel[] {
  const parsed = z.array(ChannelRowSchema).safeParse(rows);
  if (!parsed.success) throw new Error("QR の一覧の応答を読めませんでした");
  return parsed.data.map(fromChannelRow);
}

export async function listForms(userId: string): Promise<ReviewForm[]> {
  const rows = await supabaseRest<unknown>(`${FORMS}?select=${FORM_COLUMNS}&user_id=${eq(userId)}&order=created_at.asc&limit=${MAX_FORMS}`);
  return parseForms(rows);
}

export async function getForm(userId: string, id: string): Promise<ReviewForm | null> {
  const rows = await supabaseRest<unknown>(`${FORMS}?select=${FORM_COLUMNS}&user_id=${eq(userId)}&id=${eq(id)}&limit=1`);
  return parseForms(rows)[0] ?? null;
}

/** 来店客向け: slug で引く（有効な行だけ。所有者の情報は返さない） */
export async function getPublicForm(slug: string): Promise<ReviewForm | null> {
  if (!isValidSlug(slug)) return null;
  const rows = await supabaseRest<unknown>(`${FORMS}?select=${FORM_COLUMNS}&slug=${eq(slug)}&active=is.true&limit=1`);
  return parseForms(rows)[0] ?? null;
}

export interface NewForm {
  title: string;
  storeName: string;
  placeId: string | null;
  writeReviewUrl: string | null;
  questions: ReviewQuestion[];
  settings: ReviewFormSettings;
}

export async function createForm(userId: string, input: NewForm, slug = newSlug()): Promise<ReviewForm> {
  const now = new Date().toISOString();
  const rows = await supabaseRest<unknown>(`${FORMS}?select=${FORM_COLUMNS}`, {
    method: "POST",
    body: {
      user_id: userId,
      slug,
      title: input.title,
      store_name: input.storeName,
      place_id: input.placeId,
      write_review_url: input.writeReviewUrl,
      questions: input.questions,
      settings: input.settings,
      active: true,
      created_at: now,
      updated_at: now,
    },
    prefer: "return=representation",
  });
  const form = parseForms(rows)[0];
  if (!form) throw new Error("保存後の応答を読めませんでした");
  return form;
}

export type FormPatch = Partial<Pick<NewForm, "title" | "storeName" | "placeId" | "writeReviewUrl" | "questions" | "settings">> & {
  active?: boolean;
};

export async function updateForm(userId: string, id: string, patch: FormPatch): Promise<ReviewForm | null> {
  const body: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.title !== undefined) body.title = patch.title;
  if (patch.storeName !== undefined) body.store_name = patch.storeName;
  if (patch.placeId !== undefined) body.place_id = patch.placeId;
  if (patch.writeReviewUrl !== undefined) body.write_review_url = patch.writeReviewUrl;
  if (patch.questions !== undefined) body.questions = patch.questions;
  if (patch.settings !== undefined) body.settings = patch.settings;
  if (patch.active !== undefined) body.active = patch.active;
  const rows = await supabaseRest<unknown>(`${FORMS}?select=${FORM_COLUMNS}&user_id=${eq(userId)}&id=${eq(id)}`, {
    method: "PATCH",
    body,
    prefer: "return=representation",
  });
  return parseForms(rows)[0] ?? null;
}

/** 消せたら true（回答と QR は外部キーの cascade で消える） */
export async function deleteForm(userId: string, id: string): Promise<boolean> {
  const rows = await supabaseRest<unknown>(`${FORMS}?select=id&user_id=${eq(userId)}&id=${eq(id)}`, {
    method: "DELETE",
    prefer: "return=representation",
  });
  return Array.isArray(rows) && rows.length > 0;
}

/* ───────────── QR の発行単位 ───────────── */

/** formId は getForm で所有を確認したものを渡す */
export async function listChannels(formId: string): Promise<ReviewChannel[]> {
  const rows = await supabaseRest<unknown>(`${CHANNELS}?select=${CHANNEL_COLUMNS}&form_id=${eq(formId)}&order=created_at.asc&limit=${MAX_CHANNELS}`);
  return parseChannels(rows);
}

export interface NewChannel {
  label: string;
  storeName?: string | null;
  placeId?: string | null;
  writeReviewUrl?: string | null;
}

export async function addChannel(formId: string, input: NewChannel, code = newChannelCode()): Promise<ReviewChannel> {
  const rows = await supabaseRest<unknown>(`${CHANNELS}?select=${CHANNEL_COLUMNS}`, {
    method: "POST",
    body: {
      form_id: formId,
      code,
      label: input.label,
      store_name: input.storeName ?? null,
      place_id: input.placeId ?? null,
      write_review_url: input.writeReviewUrl ?? null,
      created_at: new Date().toISOString(),
    },
    prefer: "return=representation",
  });
  const ch = parseChannels(rows)[0];
  if (!ch) throw new Error("保存後の応答を読めませんでした");
  return ch;
}

export async function deleteChannel(formId: string, channelId: string): Promise<boolean> {
  const rows = await supabaseRest<unknown>(`${CHANNELS}?select=id&form_id=${eq(formId)}&id=${eq(channelId)}`, {
    method: "DELETE",
    prefer: "return=representation",
  });
  return Array.isArray(rows) && rows.length > 0;
}

/** 来店客向け: コードから発行単位を引く（無ければ null。QR の無い直リンクでも回答できる） */
export async function findChannelByCode(formId: string, code: string): Promise<ReviewChannel | null> {
  if (!isValidChannelCode(code)) return null;
  const rows = await supabaseRest<unknown>(`${CHANNELS}?select=${CHANNEL_COLUMNS}&form_id=${eq(formId)}&code=${eq(code)}&limit=1`);
  return parseChannels(rows)[0] ?? null;
}
