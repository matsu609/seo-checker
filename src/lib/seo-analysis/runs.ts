/**
 * 精密診断の実行記録（Supabase の analysis_runs テーブル）。サーバー専用。
 *
 * 1 行 = 1 回の分析（収集 → AI 分析）。月の回数制限はこの行数で数える。
 * 行は必ず user_id で絞る（service_role は RLS を素通りするため）。
 * テーブル定義は docs/dev/OPERATIONS.md の SQL を参照。
 */
import { z } from "zod";
import type { AuditResult } from "@/lib/audit/types";
import { DbError, supabaseRest } from "@/lib/db/supabase";
import { eq, gte } from "@/lib/db/filters";
import { DEFAULT_MONTHLY_LIMIT, MAX_ANALYSES_PER_RUN } from "./limits";
import type { AnalysisRecord } from "./ai/schema";
import type { AnalysisInput, SeoFactSheet } from "./sheet/types";

const TABLE = "analysis_runs";
const LIST_COLUMNS = "id,url,origin,status,created_at,updated_at,analysis_count,headline";
export const HISTORY_LIMIT = 30;
export { MAX_ANALYSES_PER_RUN, DEFAULT_MONTHLY_LIMIT };

export type RunStatus = "collected" | "analyzed" | "failed";

export interface RunSummary {
  id: string;
  url: string;
  origin: string;
  status: RunStatus;
  createdAt: string;
  updatedAt: string;
  analysisCount: number;
  headline: string | null;
  /** auto = 月 1 回の自動再診断（r127）。古い行は manual */
  source: "manual" | "auto";
}

export interface RunDetail extends RunSummary {
  input: AnalysisInput;
  sheet: SeoFactSheet;
  /** サイト診断の全結果（課題一覧・ページ一覧）。列が無い古い行は null */
  audit: AuditResult | null;
  analysis: AnalysisRecord | null;
}

const SummaryRow = z.object({
  id: z.string(),
  url: z.string(),
  origin: z.string(),
  status: z.enum(["collected", "analyzed", "failed"]),
  created_at: z.string(),
  updated_at: z.string(),
  analysis_count: z.number(),
  headline: z.string().nullable(),
  /** `input->>source`（一覧の select だけが持つ。保存直後の応答には無い） */
  source: z.string().nullable().optional(),
});

/** 一覧用（`input` の中の source だけを列として引く） */
const LIST_COLUMNS_WITH_SOURCE = `${LIST_COLUMNS},source:input->>source`;

const DetailRow = SummaryRow.extend({
  input: z.unknown(),
  sheet: z.unknown(),
  analysis: z.unknown().nullable(),
  audit: z.unknown().nullable().optional(),
});


function toSummary(row: z.infer<typeof SummaryRow>, source?: "manual" | "auto"): RunSummary {
  return {
    id: row.id,
    url: row.url,
    origin: row.origin,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    analysisCount: row.analysis_count,
    headline: row.headline,
    source: source ?? (row.source === "auto" ? "auto" : "manual"),
  };
}

export function monthlyLimit(): number {
  const raw = Number(process.env.SEO_ANALYSIS_MONTHLY_LIMIT);
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : DEFAULT_MONTHLY_LIMIT;
}

/** 今月の初日（JST）を ISO で。テストのため now を受け取る */
export function monthStartJst(now = new Date()): string {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const y = jst.getUTCFullYear();
  const m = jst.getUTCMonth();
  // JST の月初 0:00 = UTC の前日 15:00
  return new Date(Date.UTC(y, m, 1, -9, 0, 0)).toISOString();
}

/** 今月に開始した回数（失敗した収集と、月 1 回の自動再診断は数えない） */
export async function countThisMonth(userId: string, now = new Date()): Promise<number> {
  const rows = await supabaseRest<unknown>(
    `${TABLE}?select=id,source:input->>source&user_id=${eq(userId)}&status=neq.failed&created_at=${gte(monthStartJst(now))}&limit=1000`,
  );
  const parsed = z.array(z.object({ id: z.string(), source: z.string().nullable().optional() })).safeParse(rows);
  if (!parsed.success) return Array.isArray(rows) ? rows.length : 0;
  return parsed.data.filter((r) => r.source !== "auto").length;
}

export interface CreateRunInput {
  userId: string;
  input: AnalysisInput;
  origin: string;
  sheet: SeoFactSheet;
  /** サイト診断の全結果（`audit` 列。列が無ければ落として保存する） */
  audit: AuditResult;
}

export async function createRun(args: CreateRunInput): Promise<RunSummary> {
  const base = {
    user_id: args.userId,
    url: args.input.url,
    origin: args.origin,
    status: "collected",
    input: args.input,
    sheet: args.sheet,
    analysis: null,
    analysis_count: 0,
    headline: null,
  };
  let rows: unknown;
  try {
    rows = await supabaseRest<unknown>(`${TABLE}?select=${LIST_COLUMNS}`, {
      method: "POST",
      body: { ...base, audit: args.audit },
      prefer: "return=representation",
    });
  } catch (err) {
    // `audit` 列を足す SQL（OPERATIONS.md）を実行していない環境では 400 になる。
    // 詳細（課題一覧）だけを諦めて、事実シートと AI 分析は動かす
    if (!(err instanceof DbError) || err.status !== 400) throw err;
    console.warn("[seo-analysis] analysis_runs.audit 列が無いため、サイト診断の全結果は保存しません");
    rows = await supabaseRest<unknown>(`${TABLE}?select=${LIST_COLUMNS}`, { method: "POST", body: base, prefer: "return=representation" });
  }
  const parsed = z.array(SummaryRow).min(1).safeParse(rows);
  if (!parsed.success) throw new Error("保存後の応答を読めませんでした");
  return toSummary(parsed.data[0], args.input.source === "auto" ? "auto" : "manual");
}

/** 収集に失敗した自動再診断を記録する（同じサイトを毎日やり直さないための印。画面には「失敗」と理由が出る） */
export async function createFailedRun(args: { userId: string; input: AnalysisInput; origin: string; reason: string }): Promise<void> {
  await supabaseRest<unknown>(TABLE, {
    method: "POST",
    body: { user_id: args.userId, url: args.input.url, origin: args.origin, status: "failed", input: args.input, sheet: {}, analysis: null, analysis_count: 0, headline: args.reason.slice(0, 200) },
    prefer: "return=minimal",
  });
}

export async function listRuns(userId: string): Promise<RunSummary[]> {
  const rows = await supabaseRest<unknown>(`${TABLE}?select=${LIST_COLUMNS_WITH_SOURCE}&user_id=${eq(userId)}&order=created_at.desc&limit=${HISTORY_LIMIT}`);
  const parsed = z.array(SummaryRow).safeParse(rows);
  if (!parsed.success) throw new Error("履歴の応答を読めませんでした");
  return parsed.data.map((r) => toSummary(r));
}

/** この診断の直前（同じサイト・収集できたもの）。差分の比較相手。無ければ null */
export async function previousRun(userId: string, origin: string, before: string, excludeId: string): Promise<RunSummary | null> {
  const rows = await supabaseRest<unknown>(
    `${TABLE}?select=${LIST_COLUMNS_WITH_SOURCE}&user_id=${eq(userId)}&origin=${eq(origin)}&status=neq.failed&created_at=lt.${encodeURIComponent(before)}&id=neq.${encodeURIComponent(excludeId)}&order=created_at.desc&limit=1`,
  );
  const parsed = z.array(SummaryRow).safeParse(rows);
  if (!parsed.success || !parsed.data[0]) return null;
  return toSummary(parsed.data[0]);
}

/** 自動再診断の候補: 利用者 × サイトごとの最新の行（全利用者）。定期処理だけが使う */
export async function listLatestRunsAllUsers(limit = 2000): Promise<{ userId: string; origin: string; status: RunStatus; createdAt: string; input: unknown }[]> {
  const rows = await supabaseRest<unknown>(`${TABLE}?select=user_id,origin,status,created_at,input&order=created_at.desc&limit=${limit}`);
  const parsed = z.array(z.object({ user_id: z.string(), origin: z.string(), status: z.enum(["collected", "analyzed", "failed"]), created_at: z.string(), input: z.unknown() })).safeParse(rows);
  if (!parsed.success) return [];
  return parsed.data.map((r) => ({ userId: r.user_id, origin: r.origin, status: r.status, createdAt: r.created_at, input: r.input }));
}

export async function getRun(userId: string, id: string): Promise<RunDetail | null> {
  const rows = await supabaseRest<unknown>(`${TABLE}?select=*&user_id=${eq(userId)}&id=${eq(id)}&limit=1`);
  const parsed = z.array(DetailRow).safeParse(rows);
  if (!parsed.success) throw new Error("履歴の応答を読めませんでした");
  const row = parsed.data[0];
  if (!row) return null;
  // 本文は自分のサーバーが入れたものなので、形の再検証はしない（型だけ付ける）
  return {
    ...toSummary(row),
    input: row.input as AnalysisInput,
    sheet: row.sheet as SeoFactSheet,
    analysis: (row.analysis as AnalysisRecord | null) ?? null,
    audit: (row.audit as AuditResult | null | undefined) ?? null,
  };
}

export async function saveAnalysis(userId: string, id: string, record: AnalysisRecord, analysisCount: number): Promise<void> {
  await supabaseRest<unknown>(`${TABLE}?user_id=${eq(userId)}&id=${eq(id)}`, {
    method: "PATCH",
    body: {
      status: "analyzed",
      analysis: record,
      analysis_count: analysisCount,
      headline: record.analysis.headline,
      updated_at: new Date().toISOString(),
    },
    prefer: "return=minimal",
  });
}


export async function deleteRun(userId: string, id: string): Promise<void> {
  await supabaseRest<unknown>(`${TABLE}?user_id=${eq(userId)}&id=${eq(id)}`, { method: "DELETE", prefer: "return=minimal" });
}

/**
 * そのサイトの直近の診断から「重要度の高いページ」の URL（サイト監視の主要ページに使う）。
 * 行全体（1 MB 近い）を読まず、JSON の一部だけを選ぶ。診断が無ければ空配列。
 */
export async function listTopPages(userId: string, origin: string, limit = 10): Promise<string[]> {
  const rows = await supabaseRest<unknown>(
    `${TABLE}?select=top:sheet->site->structure->topPages&user_id=${eq(userId)}&origin=${eq(origin)}&status=neq.failed&order=created_at.desc&limit=1`,
  );
  const parsed = z.array(z.object({ top: z.array(z.object({ url: z.string() })).nullable() })).safeParse(rows);
  if (!parsed.success || !parsed.data[0]?.top) return [];
  return parsed.data[0].top.map((p) => p.url).slice(0, limit);
}
