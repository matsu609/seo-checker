/**
 * MEO 診断報告書の保存・履歴（Supabase の meo_reports テーブル）。サーバー専用。
 *
 * 保存するのはサーバーで組み立てた報告書だけ（ブラウザから届いた JSON を
 * そのまま入れない）。AI 総評は画面で生成済みの段落を受け取り、長さを縛って添える。
 * 行は必ず user_id で絞る（service_role は RLS を素通りするため、ここが唯一の境界）。
 *
 * テーブル定義は docs/dev/OPERATIONS.md の SQL を参照。
 */
import { z } from "zod";
import { supabaseRest } from "@/lib/db/supabase";
import type { MeoReport } from "./report";
import { CATEGORY_ORDER, type CategoryId } from "./score";

/** 一覧 1 行分（本文は含まない） */
export interface MeoHistoryItem {
  id: string;
  placeId: string;
  placeName: string;
  /** 診断日時（ISO 8601） */
  generatedAt: string;
  score: number | null;
  grade: string | null;
  categoryScores: Record<CategoryId, number | null>;
}

/** 保存する報告書（AI 総評があれば一緒に） */
export interface SavedMeoReport extends MeoReport {
  aiCommentary: string[] | null;
}

export const HISTORY_LIMIT = 50;
export const AI_COMMENTARY_MAX_PARAGRAPHS = 5;
export const AI_COMMENTARY_MAX_CHARS = 2000;

export const AiCommentarySchema = z
  .array(z.string().max(AI_COMMENTARY_MAX_CHARS))
  .max(AI_COMMENTARY_MAX_PARAGRAPHS);

const TABLE = "meo_reports";
const LIST_COLUMNS = "id,place_id,place_name,generated_at,score,grade,category_scores";

const CategoryScoresSchema = z.record(z.string(), z.number().nullable());

const RowSchema = z.object({
  id: z.string(),
  place_id: z.string(),
  place_name: z.string(),
  generated_at: z.string(),
  score: z.number().nullable(),
  grade: z.string().nullable(),
  category_scores: CategoryScoresSchema,
});

const FullRowSchema = RowSchema.extend({ report: z.unknown() });

export type MeoReportRow = z.infer<typeof RowSchema>;

/** 報告書 → 挿入する行（純粋関数） */
export function toRow(userId: string, report: SavedMeoReport) {
  const categoryScores: Record<string, number | null> = {};
  for (const c of report.score.categories) categoryScores[c.id] = c.score;
  return {
    user_id: userId,
    place_id: report.detail.id,
    place_name: report.detail.name,
    generated_at: report.generatedAt,
    score: report.score.score,
    grade: report.score.grade?.grade ?? null,
    category_scores: categoryScores,
    report,
  };
}

/** 行 → 一覧の 1 件（純粋関数）。カテゴリは定義順に揃え、無いものは null */
export function fromRow(row: MeoReportRow): MeoHistoryItem {
  const categoryScores = {} as Record<CategoryId, number | null>;
  for (const id of CATEGORY_ORDER) categoryScores[id] = row.category_scores[id] ?? null;
  return {
    id: row.id,
    placeId: row.place_id,
    placeName: row.place_name,
    generatedAt: row.generated_at,
    score: row.score,
    grade: row.grade,
    categoryScores,
  };
}

function eq(value: string): string {
  return `eq.${encodeURIComponent(value)}`;
}

export async function saveMeoReport(userId: string, report: SavedMeoReport): Promise<MeoHistoryItem> {
  const rows = await supabaseRest<unknown>(`${TABLE}?select=${LIST_COLUMNS}`, {
    method: "POST",
    body: toRow(userId, report),
    prefer: "return=representation",
  });
  const parsed = z.array(RowSchema).min(1).safeParse(rows);
  if (!parsed.success) throw new Error("保存後の応答を読めませんでした");
  return fromRow(parsed.data[0]);
}

/** 新しい順。placeId を渡すとその店舗だけ */
export async function listMeoReports(userId: string, placeId?: string): Promise<MeoHistoryItem[]> {
  const filter = placeId ? `&place_id=${eq(placeId)}` : "";
  const rows = await supabaseRest<unknown>(
    `${TABLE}?select=${LIST_COLUMNS}&user_id=${eq(userId)}${filter}&order=generated_at.desc&limit=${HISTORY_LIMIT}`,
  );
  const parsed = z.array(RowSchema).safeParse(rows);
  if (!parsed.success) throw new Error("履歴の応答を読めませんでした");
  return parsed.data.map(fromRow);
}

export interface MeoHistoryEntry {
  item: MeoHistoryItem;
  report: SavedMeoReport;
}

/** 本文つきで 1 件。他人の行や無い行は null */
export async function getMeoReport(userId: string, id: string): Promise<MeoHistoryEntry | null> {
  const rows = await supabaseRest<unknown>(`${TABLE}?select=*&user_id=${eq(userId)}&id=${eq(id)}&limit=1`);
  const parsed = z.array(FullRowSchema).safeParse(rows);
  if (!parsed.success) throw new Error("履歴の応答を読めませんでした");
  const row = parsed.data[0];
  if (!row) return null;
  // 本文は自分のサーバーが入れたものなので、形の再検証はしない（型だけ付ける）
  return { item: fromRow(row), report: row.report as SavedMeoReport };
}

/** 消せたら true（他人の行や無い行は false） */
export async function deleteMeoReport(userId: string, id: string): Promise<boolean> {
  const rows = await supabaseRest<unknown>(`${TABLE}?select=id&user_id=${eq(userId)}&id=${eq(id)}`, {
    method: "DELETE",
    prefer: "return=representation",
  });
  return Array.isArray(rows) && rows.length > 0;
}
