/**
 * アンケートの回答（review_responses）。Supabase。サーバー専用。
 *
 * 来店客が送った回答・AI 下書き・編集後の本文・ボタンの押下・「お店に直接伝える」の本文と、
 * 店舗側の対応状態・メモを 1 行に持つ。
 *
 * 来店客側の更新（押下の記録、直接伝える）は、回答時に発行した edit_token を持つ人だけができる
 * （URL を知っているだけの第三者が他人の回答を書き換えられないように）。
 * 店舗側の読み書きは、必ず getForm（user_id で絞る）で所有を確かめた form_id で行う。
 * テーブル定義は docs/dev/OPERATIONS.md の SQL を参照。
 */
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { DbError, supabaseRest } from "@/lib/db/supabase";
import { isSurveyLocale, type SurveyLocale } from "./i18n";
import { RawAnswersSchema, type Answers } from "./questions";

export const RESPONSE_STATUSES = ["open", "in_progress", "done"] as const;
export type ResponseStatus = (typeof RESPONSE_STATUSES)[number];
export const RESPONSE_STATUS_LABELS: Record<ResponseStatus, string> = {
  open: "未対応",
  in_progress: "対応中",
  done: "対応済み",
};

export type DraftSource = "ai" | "fallback" | "none";

export interface ReviewResponse {
  id: string;
  formId: string;
  channelId: string | null;
  rating: number | null;
  answers: Answers;
  isLow: boolean;
  /** AI（またはルール）が作った下書き */
  draft: string | null;
  draftSource: DraftSource;
  /** 来店客が投稿ボタンを押した時点の本文（編集後） */
  draftFinal: string | null;
  directMessage: string | null;
  directContact: string | null;
  clickedReviewAt: string | null;
  clickedDirectAt: string | null;
  status: ResponseStatus;
  note: string | null;
  handledAt: string | null;
  /** 来店客が答えた画面の言語（列が無い古い行は null = 日本語） */
  lang: SurveyLocale | null;
  createdAt: string;
}

/** 一覧の取得上限（集計もこの範囲で行う） */
export const RESPONSES_LIMIT = 1000;

const TABLE = "review_responses";
const BASE_COLUMNS =
  "id,form_id,channel_id,rating,answers,is_low,draft,draft_source,draft_final,direct_message,direct_contact,clicked_review_at,clicked_direct_at,status,note,handled_at,created_at";
/** `lang` 列は r38 で追加（alter table）。まだ無い環境でも動くよう、400 が返ったら列なしでやり直す */
let langColumnMissing = false;
const columns = () => (langColumnMissing ? BASE_COLUMNS : `${BASE_COLUMNS},lang`);

/** lang 列が無い（PostgREST が 400）ときは、列なしで 1 回だけやり直す */
async function withLangFallback<T>(run: (cols: string, withLang: boolean) => Promise<T>): Promise<T> {
  try {
    return await run(columns(), !langColumnMissing);
  } catch (err) {
    if (langColumnMissing || !(err instanceof DbError) || err.status !== 400) throw err;
    langColumnMissing = true;
    console.error("[reviews] review_responses.lang 列が無いため、言語なしで続けます（OPERATIONS.md の r38 の alter table を実行してください）");
    return run(columns(), false);
  }
}

const RowSchema = z.object({
  id: z.string(),
  form_id: z.string(),
  channel_id: z.string().nullable(),
  rating: z.number().nullable(),
  answers: z.unknown(),
  is_low: z.boolean(),
  draft: z.string().nullable(),
  draft_source: z.string().nullable(),
  draft_final: z.string().nullable(),
  direct_message: z.string().nullable(),
  direct_contact: z.string().nullable(),
  clicked_review_at: z.string().nullable(),
  clicked_direct_at: z.string().nullable(),
  status: z.string(),
  note: z.string().nullable(),
  handled_at: z.string().nullable(),
  lang: z.string().nullable().optional(),
  created_at: z.string(),
});
export type ReviewResponseRow = z.infer<typeof RowSchema>;

function eq(value: string): string {
  return `eq.${encodeURIComponent(value)}`;
}

function toStatus(s: string): ResponseStatus {
  return (RESPONSE_STATUSES as readonly string[]).includes(s) ? (s as ResponseStatus) : "open";
}

function toSource(s: string | null): DraftSource {
  return s === "ai" || s === "fallback" ? s : "none";
}

export function fromResponseRow(row: ReviewResponseRow): ReviewResponse {
  const answers = RawAnswersSchema.safeParse(row.answers);
  return {
    id: row.id,
    formId: row.form_id,
    channelId: row.channel_id,
    rating: row.rating,
    answers: answers.success ? (answers.data as Answers) : {},
    isLow: row.is_low,
    draft: row.draft,
    draftSource: toSource(row.draft_source),
    draftFinal: row.draft_final,
    directMessage: row.direct_message,
    directContact: row.direct_contact,
    clickedReviewAt: row.clicked_review_at,
    clickedDirectAt: row.clicked_direct_at,
    status: toStatus(row.status),
    note: row.note,
    handledAt: row.handled_at,
    lang: isSurveyLocale(row.lang) ? row.lang : null,
    createdAt: row.created_at,
  };
}

function parseRows(rows: unknown): ReviewResponse[] {
  const parsed = z.array(RowSchema).safeParse(rows);
  if (!parsed.success) throw new Error("回答の応答を読めませんでした");
  return parsed.data.map(fromResponseRow);
}

/** 来店客に返す更新用トークン（32 文字の hex） */
export function newEditToken(bytes: (n: number) => Buffer = randomBytes): string {
  return bytes(16).toString("hex");
}
const TOKEN = /^[0-9a-f]{32}$/;
export function isValidEditToken(token: string): boolean {
  return TOKEN.test(token);
}

export interface NewResponse {
  formId: string;
  channelId: string | null;
  rating: number | null;
  answers: Answers;
  isLow: boolean;
  draft: string | null;
  draftSource: DraftSource;
  editToken: string;
  /** 来店客の画面の言語（省略時は日本語） */
  lang?: SurveyLocale;
}

export async function insertResponse(input: NewResponse, at = new Date()): Promise<ReviewResponse> {
  const rows = await withLangFallback((cols, withLang) =>
    supabaseRest<unknown>(`${TABLE}?select=${cols}`, {
      method: "POST",
      body: {
        form_id: input.formId,
        channel_id: input.channelId,
        rating: input.rating,
        answers: input.answers,
        is_low: input.isLow,
        draft: input.draft,
        draft_source: input.draftSource,
        edit_token: input.editToken,
        status: "open",
        created_at: at.toISOString(),
        ...(withLang ? { lang: input.lang ?? "ja" } : {}),
      },
      prefer: "return=representation",
    }),
  );
  const r = parseRows(rows)[0];
  if (!r) throw new Error("保存後の応答を読めませんでした");
  return r;
}

export interface ListFilter {
  status?: ResponseStatus;
  /** true = 低評価だけ */
  lowOnly?: boolean;
  channelId?: string;
  /** ISO 日付（この日以降） */
  from?: string;
  /** ISO 日付（この日まで。翌日 0:00 未満） */
  to?: string;
}

/** formId は所有を確かめたものを渡す。新しい順 */
export async function listResponses(formId: string, filter: ListFilter = {}, limit = RESPONSES_LIMIT): Promise<ReviewResponse[]> {
  const params = [`form_id=${eq(formId)}`, "order=created_at.desc", `limit=${limit}`];
  if (filter.status) params.push(`status=${eq(filter.status)}`);
  if (filter.lowOnly) params.push("is_low=is.true");
  if (filter.channelId) params.push(`channel_id=${eq(filter.channelId)}`);
  if (filter.from) params.push(`created_at=gte.${encodeURIComponent(filter.from)}`);
  if (filter.to) params.push(`created_at=lt.${encodeURIComponent(filter.to)}`);
  const rows = await withLangFallback((cols) => supabaseRest<unknown>(`${TABLE}?select=${cols}&${params.join("&")}`));
  return parseRows(rows);
}

/** 1 件（所有の確認は呼び出し側が formId で行う） */
export async function getResponse(id: string): Promise<ReviewResponse | null> {
  const rows = await withLangFallback((cols) => supabaseRest<unknown>(`${TABLE}?select=${cols}&id=${eq(id)}&limit=1`));
  return parseRows(rows)[0] ?? null;
}

/** 来店客側の更新。id と edit_token の両方が一致した行だけ */
async function patchByToken(formId: string, id: string, token: string, body: Record<string, unknown>): Promise<ReviewResponse | null> {
  if (!isValidEditToken(token)) return null;
  const rows = await withLangFallback((cols) =>
    supabaseRest<unknown>(`${TABLE}?select=${cols}&form_id=${eq(formId)}&id=${eq(id)}&edit_token=${eq(token)}`, { method: "PATCH", body, prefer: "return=representation" }),
  );
  return parseRows(rows)[0] ?? null;
}

/** 「Google マップに投稿する」を押した（編集後の本文つき） */
export async function markReviewClicked(formId: string, id: string, token: string, draftFinal: string | null, at = new Date()) {
  return patchByToken(formId, id, token, { clicked_review_at: at.toISOString(), ...(draftFinal !== null ? { draft_final: draftFinal } : {}) });
}

/** 「お店に直接伝える」を送った */
export async function saveDirectMessage(formId: string, id: string, token: string, message: string, contact: string | null, at = new Date()) {
  return patchByToken(formId, id, token, { clicked_direct_at: at.toISOString(), direct_message: message, direct_contact: contact });
}

export interface ResponsePatch {
  status?: ResponseStatus;
  note?: string | null;
}

/** 店舗側の更新（対応状態・メモ）。formId は所有を確かめたもの */
export async function updateResponse(formId: string, id: string, patch: ResponsePatch, at = new Date()): Promise<ReviewResponse | null> {
  const body: Record<string, unknown> = {};
  if (patch.status !== undefined) {
    body.status = patch.status;
    body.handled_at = patch.status === "open" ? null : at.toISOString();
  }
  if (patch.note !== undefined) body.note = patch.note;
  if (Object.keys(body).length === 0) return null;
  const rows = await withLangFallback((cols) =>
    supabaseRest<unknown>(`${TABLE}?select=${cols}&form_id=${eq(formId)}&id=${eq(id)}`, { method: "PATCH", body, prefer: "return=representation" }),
  );
  return parseRows(rows)[0] ?? null;
}

export async function deleteResponse(formId: string, id: string): Promise<boolean> {
  const rows = await supabaseRest<unknown>(`${TABLE}?select=id&form_id=${eq(formId)}&id=${eq(id)}`, {
    method: "DELETE",
    prefer: "return=representation",
  });
  return Array.isArray(rows) && rows.length > 0;
}
