/**
 * AI 検索モニタリングの保存（Supabase）。サーバー専用。
 *
 * テーブルは 7 つ（仕様書 §8）。SQL は docs/dev/OPERATIONS.md に置く。
 * `geo_measurements` だけは **アカウントをまたいで共有する**（§7.1）ので user_id を持たない。
 * それ以外の行は必ず user_id で絞る（service_role は RLS を素通りするため）。
 */
import { z } from "zod";
import { supabaseRest } from "@/lib/db/supabase";
import { eq, gte } from "@/lib/db/filters";
import { cacheKey } from "./normalize";
import { MONTHLY_CREDITS, nextResetAt } from "./credits";
import { decodeStoredCitations, encodeStoredCitations, rankForDomains } from "./organic";
import { runDayOffsetFor } from "./schedule";
import type {
  CreditAction,
  CreditLedgerEntry,
  GeoAccount,
  GeoBrand,
  GeoKeyword,
  GeoMeasurement,
  GeoModel,
  GeoObservation,
  GeoPrompt,
  MeasurementKind,
  RunMode,
} from "./types";

const T_ACCOUNT = "geo_accounts";
const T_BRAND = "geo_brands";
const T_KEYWORD = "geo_keywords";
const T_PROMPT = "geo_prompts";
const T_MEASUREMENT = "geo_measurements";
const T_OBSERVATION = "geo_observations";
const T_LEDGER = "geo_credit_ledger";
const T_VERSION = "geo_model_versions";

/** キャッシュを使い回してよい時間（§7.1: 24 時間） */
export const CACHE_WINDOW_MS = 24 * 60 * 60 * 1000;


/* ───────────── アカウント ───────────── */

const AccountRow = z.object({
  user_id: z.string(),
  credit_balance: z.number(),
  credit_reset_at: z.string(),
  run_day_offset: z.number(),
  precision_slots: z.number(),
  created_at: z.string(),
});

function toAccount(row: z.infer<typeof AccountRow>): GeoAccount {
  return {
    userId: row.user_id,
    creditBalance: row.credit_balance,
    creditResetAt: row.credit_reset_at,
    runDayOffset: row.run_day_offset,
    precisionSlots: row.precision_slots,
    createdAt: row.created_at,
  };
}

/** 無ければ作る。オフセットは利用者 ID から決まる（§2.4） */
export async function ensureAccount(userId: string, now = new Date()): Promise<GeoAccount> {
  const rows = await supabaseRest<unknown>(`${T_ACCOUNT}?select=*&user_id=${eq(userId)}&limit=1`);
  const parsed = z.array(AccountRow).safeParse(rows);
  if (parsed.success && parsed.data[0]) return toAccount(parsed.data[0]);

  const created = await supabaseRest<unknown>(`${T_ACCOUNT}?select=*`, {
    method: "POST",
    body: {
      user_id: userId,
      credit_balance: MONTHLY_CREDITS,
      credit_reset_at: nextResetAt(now),
      run_day_offset: runDayOffsetFor(userId),
      precision_slots: 5,
    },
    prefer: "return=representation",
  });
  const after = z.array(AccountRow).min(1).safeParse(created);
  if (!after.success) throw new Error("アカウントを作成できませんでした");
  return toAccount(after.data[0]);
}

export async function updateAccount(userId: string, patch: Partial<Pick<GeoAccount, "creditBalance" | "creditResetAt" | "precisionSlots">>): Promise<void> {
  const body: Record<string, unknown> = {};
  if (patch.creditBalance !== undefined) body.credit_balance = patch.creditBalance;
  if (patch.creditResetAt !== undefined) body.credit_reset_at = patch.creditResetAt;
  if (patch.precisionSlots !== undefined) body.precision_slots = patch.precisionSlots;
  if (Object.keys(body).length === 0) return;
  await supabaseRest(`${T_ACCOUNT}?user_id=${eq(userId)}`, { method: "PATCH", body, prefer: "return=minimal" });
}

/** 定期バッチが回す対象（登録がある利用者だけ） */
export async function listAccounts(limit = 500): Promise<GeoAccount[]> {
  const rows = await supabaseRest<unknown>(`${T_ACCOUNT}?select=*&order=created_at.asc&limit=${limit}`);
  const parsed = z.array(AccountRow).safeParse(rows);
  return parsed.success ? parsed.data.map(toAccount) : [];
}

/* ───────────── ブランド ───────────── */

const BrandRow = z.object({
  id: z.string(),
  brand_type: z.enum(["own", "competitor"]),
  display_name: z.string(),
  aliases: z.array(z.string()),
  domains: z.array(z.string()),
  aliases_updated_at: z.string().nullable(),
  created_at: z.string(),
});

function toBrand(row: z.infer<typeof BrandRow>): GeoBrand {
  return {
    id: row.id,
    type: row.brand_type,
    displayName: row.display_name,
    aliases: row.aliases,
    domains: row.domains,
    aliasesUpdatedAt: row.aliases_updated_at,
    createdAt: row.created_at,
  };
}

export async function listBrands(userId: string): Promise<GeoBrand[]> {
  const rows = await supabaseRest<unknown>(`${T_BRAND}?select=*&user_id=${eq(userId)}&order=brand_type.asc,created_at.asc`);
  const parsed = z.array(BrandRow).safeParse(rows);
  return parsed.success ? parsed.data.map(toBrand) : [];
}

export interface BrandInput {
  type: "own" | "competitor";
  displayName: string;
  aliases: string[];
  domains: string[];
}

export async function saveBrand(userId: string, input: BrandInput, id?: string): Promise<GeoBrand> {
  const body = {
    user_id: userId,
    brand_type: input.type,
    display_name: input.displayName,
    aliases: input.aliases,
    domains: input.domains,
    aliases_updated_at: new Date().toISOString(),
  };
  const rows = id
    ? await supabaseRest<unknown>(`${T_BRAND}?select=*&user_id=${eq(userId)}&id=${eq(id)}`, { method: "PATCH", body, prefer: "return=representation" })
    : await supabaseRest<unknown>(`${T_BRAND}?select=*`, { method: "POST", body, prefer: "return=representation" });
  const parsed = z.array(BrandRow).min(1).safeParse(rows);
  if (!parsed.success) throw new Error("ブランドを保存できませんでした");
  return toBrand(parsed.data[0]);
}

export async function deleteBrand(userId: string, id: string): Promise<void> {
  await supabaseRest(`${T_BRAND}?user_id=${eq(userId)}&id=${eq(id)}`, { method: "DELETE", prefer: "return=minimal" });
}

/* ───────────── キーワード・プロンプト ───────────── */

const KeywordRow = z.object({
  id: z.string(),
  text: z.string(),
  normalized_hash: z.string(),
  track_rank: z.boolean(),
  track_aio: z.boolean(),
  created_at: z.string(),
});

const PromptRow = z.object({
  id: z.string(),
  text: z.string(),
  normalized_hash: z.string(),
  is_branded: z.boolean(),
  precision_mode: z.boolean(),
  models: z.array(z.string()),
  tags: z.array(z.string()),
  precision_mode_changed_at: z.string().nullable(),
  created_at: z.string(),
});

export async function listKeywords(userId: string): Promise<GeoKeyword[]> {
  const rows = await supabaseRest<unknown>(`${T_KEYWORD}?select=*&user_id=${eq(userId)}&order=created_at.asc`);
  const parsed = z.array(KeywordRow).safeParse(rows);
  return parsed.success
    ? parsed.data.map((r) => ({ id: r.id, text: r.text, normalizedHash: r.normalized_hash, trackRank: r.track_rank, trackAio: r.track_aio, createdAt: r.created_at }))
    : [];
}

export async function listPrompts(userId: string): Promise<GeoPrompt[]> {
  const rows = await supabaseRest<unknown>(`${T_PROMPT}?select=*&user_id=${eq(userId)}&order=created_at.asc`);
  const parsed = z.array(PromptRow).safeParse(rows);
  return parsed.success
    ? parsed.data.map((r) => ({
        id: r.id,
        text: r.text,
        normalizedHash: r.normalized_hash,
        isBranded: r.is_branded,
        precisionMode: r.precision_mode,
        models: r.models.filter((m): m is GeoModel => m === "chatgpt" || m === "gemini" || m === "aio"),
        tags: r.tags,
        precisionModeChangedAt: r.precision_mode_changed_at,
        createdAt: r.created_at,
      }))
    : [];
}

export interface KeywordInput {
  text: string;
  normalizedHash: string;
  trackRank: boolean;
  trackAio: boolean;
}

export async function saveKeyword(userId: string, input: KeywordInput): Promise<void> {
  await supabaseRest(`${T_KEYWORD}`, {
    method: "POST",
    body: { user_id: userId, text: input.text, normalized_hash: input.normalizedHash, track_rank: input.trackRank, track_aio: input.trackAio },
    prefer: "return=minimal",
  });
}

export interface PromptInput {
  text: string;
  normalizedHash: string;
  isBranded: boolean;
  precisionMode: boolean;
  models: GeoModel[];
  tags: string[];
}

export async function savePrompt(userId: string, input: PromptInput, id?: string): Promise<void> {
  const body = {
    user_id: userId,
    text: input.text,
    normalized_hash: input.normalizedHash,
    is_branded: input.isBranded,
    precision_mode: input.precisionMode,
    models: input.models,
    tags: input.tags,
    ...(input.precisionMode ? { precision_mode_changed_at: new Date().toISOString() } : {}),
  };
  if (id) {
    await supabaseRest(`${T_PROMPT}?user_id=${eq(userId)}&id=${eq(id)}`, { method: "PATCH", body, prefer: "return=minimal" });
  } else {
    await supabaseRest(T_PROMPT, { method: "POST", body, prefer: "return=minimal" });
  }
}

export async function deletePrompt(userId: string, id: string): Promise<void> {
  await supabaseRest(`${T_PROMPT}?user_id=${eq(userId)}&id=${eq(id)}`, { method: "DELETE", prefer: "return=minimal" });
}

export async function deleteKeyword(userId: string, id: string): Promise<void> {
  await supabaseRest(`${T_KEYWORD}?user_id=${eq(userId)}&id=${eq(id)}`, { method: "DELETE", prefer: "return=minimal" });
}

/* ───────────── 計測（共有） ───────────── */

const MeasurementRow = z.object({
  id: z.string(),
  kind: z.string(),
  normalized_hash: z.string(),
  text: z.string(),
  model: z.string(),
  locale: z.string(),
  executed_at: z.string(),
  model_version: z.string().nullable(),
  response_text: z.string(),
  citations: z.unknown(),
  rank: z.number().nullable(),
  mode: z.string(),
  cost_usd: z.number(),
});

function toMeasurement(row: z.infer<typeof MeasurementRow>): GeoMeasurement {
  // 順位計測は citations 列に自然検索の並びも持つ（organic.ts。2026-09-23）
  const stored = decodeStoredCitations(row.citations);
  return {
    id: row.id,
    kind: row.kind as MeasurementKind,
    normalizedHash: row.normalized_hash,
    text: row.text,
    model: row.model as GeoModel,
    locale: row.locale,
    executedAt: row.executed_at,
    modelVersion: row.model_version,
    responseText: row.response_text,
    citations: stored.citations,
    rank: row.rank,
    organic: stored.organic,
    mode: row.mode as RunMode,
    costUsd: row.cost_usd,
  };
}

/** キャッシュの引き方（§7.1 の鍵 + 2026-09-23 に足した条件） */
export interface CacheLookup {
  hash: string;
  model: GeoModel;
  locale: string;
  /**
   * 計測の種類。**同じキーワード・同じモデル名でも順位計測と AI Overviews は別物**
   * （順位計測も model = "aio" で保存しているため、種類で分けないと AI Overviews の
   * 計測が数秒前の順位計測（`load_async_ai_overview` なし）を拾い、AIO の判定が壊れていた。2026-09-23）
   */
  kind: MeasurementKind;
  /** これより前の計測は使わない（ISO）。既定は 24 時間前 */
  since?: string;
  /** 使わない計測の ID（同じアカウントがもう数えた回答を、別の反復として数え直さない） */
  exclude?: readonly string[];
}

/** PostgREST の `not.in.(...)` に入れてよい ID（uuid の形）だけを通す。値を URL に直に差し込まないため */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 除外する計測 ID のフィルタ（無ければ空文字）。純関数（テスト用に公開） */
export function excludeIdsFilter(ids: readonly string[] | undefined): string {
  const safe = (ids ?? []).filter((id) => UUID.test(id));
  return safe.length > 0 ? `&id=not.in.(${safe.join(",")})` : "";
}

/** キャッシュ照会の問い合わせ文字列（純関数。テスト用に公開） */
export function cacheQuery(lookup: CacheLookup, now = new Date()): string {
  const since = lookup.since ?? new Date(now.getTime() - CACHE_WINDOW_MS).toISOString();
  return (
    `${T_MEASUREMENT}?select=*&normalized_hash=${eq(lookup.hash)}&model=${eq(lookup.model)}&locale=${eq(lookup.locale)}` +
    `&kind=${eq(lookup.kind)}&executed_at=${gte(since)}${excludeIdsFilter(lookup.exclude)}&order=executed_at.desc,id.desc&limit=1`
  );
}

/**
 * 24 時間以内の同じ計測があれば使い回す（§7.1）。
 * **ここが顧客間の原価共有の実体**。ハッシュ × モデル × ロケール × 種類で引く。
 */
export async function findCachedMeasurement(lookup: CacheLookup, now = new Date()): Promise<GeoMeasurement | null> {
  const rows = await supabaseRest<unknown>(cacheQuery(lookup, now));
  const parsed = z.array(MeasurementRow).safeParse(rows);
  return parsed.success && parsed.data[0] ? toMeasurement(parsed.data[0]) : null;
}

export async function saveMeasurement(input: Omit<GeoMeasurement, "id">): Promise<GeoMeasurement> {
  const rows = await supabaseRest<unknown>(`${T_MEASUREMENT}?select=*`, {
    method: "POST",
    body: {
      kind: input.kind,
      normalized_hash: input.normalizedHash,
      text: input.text,
      model: input.model,
      locale: input.locale,
      executed_at: input.executedAt,
      model_version: input.modelVersion,
      response_text: input.responseText,
      citations: encodeStoredCitations(input.citations, input.organic ?? null),
      rank: input.rank,
      mode: input.mode,
      cost_usd: input.costUsd,
    },
    prefer: "return=representation",
  });
  const parsed = z.array(MeasurementRow).min(1).safeParse(rows);
  if (!parsed.success) throw new Error("計測を保存できませんでした");
  return toMeasurement(parsed.data[0]);
}

/** 直近のモデルバージョン（更新検知に使う。§5.3） */
export async function latestModelVersion(model: GeoModel): Promise<string | null> {
  const rows = await supabaseRest<unknown>(
    `${T_MEASUREMENT}?select=model_version&model=${eq(model)}&model_version=not.is.null&order=executed_at.desc&limit=1`,
  );
  const parsed = z.array(z.object({ model_version: z.string().nullable() })).safeParse(rows);
  return parsed.success && parsed.data[0] ? parsed.data[0].model_version : null;
}

export async function saveModelVersionEvent(model: GeoModel, from: string | null, to: string): Promise<void> {
  await supabaseRest(T_VERSION, {
    method: "POST",
    body: { model, version_from: from, version_to: to, detected_at: new Date().toISOString() },
    prefer: "return=minimal",
  });
}

export async function listModelVersionEvents(limit = 50): Promise<{ model: GeoModel; versionFrom: string | null; versionTo: string; detectedAt: string }[]> {
  const rows = await supabaseRest<unknown>(`${T_VERSION}?select=*&order=detected_at.desc&limit=${limit}`);
  const parsed = z
    .array(z.object({ model: z.string(), version_from: z.string().nullable(), version_to: z.string(), detected_at: z.string() }))
    .safeParse(rows);
  return parsed.success
    ? parsed.data.map((r) => ({ model: r.model as GeoModel, versionFrom: r.version_from, versionTo: r.version_to, detectedAt: r.detected_at }))
    : [];
}

/* ───────────── 観測 ───────────── */

export async function saveObservations(userId: string, rows: readonly Omit<GeoObservation, "id">[]): Promise<void> {
  if (rows.length === 0) return;
  await supabaseRest(T_OBSERVATION, {
    method: "POST",
    body: rows.map((o) => ({
      user_id: userId,
      measurement_id: o.measurementId,
      prompt_id: o.promptId,
      keyword_id: o.keywordId,
      brand_id: o.brandId,
      cited: o.cited,
      mentioned: o.mentioned,
      mention_confidence: o.mentionConfidence,
      position: o.position,
      cited_domains: o.citedDomains,
      domain_class: o.domainClass,
      observed_at: o.observedAt,
    })),
    prefer: "return=minimal",
  });
}

const ObservationJoinRow = z.object({
  brand_id: z.string(),
  prompt_id: z.string().nullable(),
  keyword_id: z.string().nullable(),
  mentioned: z.boolean(),
  cited: z.boolean(),
  mention_confidence: z.number(),
  cited_domains: z.array(z.string()).nullable(),
  domain_class: z.string().nullable(),
  observed_at: z.string(),
  geo_measurements: z.object({ model: z.string(), executed_at: z.string(), kind: z.string().optional() }).nullable(),
});

/** 観測 1 行（ダッシュボード・月次レポートが読む形） */
export interface ObservationRow {
  brandId: string;
  promptId: string | null;
  keywordId: string | null;
  /** 引用されたドメイン（SQL では取っていたのに捨てていた。2026-09-22） */
  citedDomains: string[];
  mentioned: boolean;
  cited: boolean;
  confidence: number;
  domainClass: string | null;
  model: GeoModel;
  /**
   * 計測の種類（2026-09-23 に足した）。順位計測（rank）も model = "aio" で保存しているので、
   * **種類を見ないとシェアの分母にプロンプトとキーワードの観測が混ざる**
   */
  kind: MeasurementKind;
  executedAt: string;
}

/** 観測の期間。`days`（今から何日前まで）か、ISO の範囲（end は含まない）で指定する */
export type ObservationRange = number | { start: string; end: string };

/** 未満フィルタ（`lt.<エスケープ済みの値>`）。月の範囲で引くときに使う */
function lt(value: string): string {
  return `lt.${encodeURIComponent(value)}`;
}

/** 観測を引く問い合わせ文字列（純関数。テスト用に公開） */
export function observationsQuery(userId: string, range: ObservationRange, now = new Date()): string {
  const period =
    typeof range === "number"
      ? `&observed_at=${gte(new Date(now.getTime() - range * 24 * 60 * 60 * 1000).toISOString())}`
      : `&observed_at=${gte(range.start)}&observed_at=${lt(range.end)}`;
  return (
    `${T_OBSERVATION}?select=brand_id,prompt_id,keyword_id,mentioned,cited,mention_confidence,cited_domains,domain_class,observed_at,` +
    `geo_measurements(model,executed_at,kind)&user_id=${eq(userId)}${period}&order=observed_at.desc&limit=20000`
  );
}

/**
 * ダッシュボード・月次レポート用。観測にモデル・種類・実行日時を添えて返す。
 * 期間は「直近 N 日」か「月の範囲」（月次レポートは対象月で引く。今日から数えると
 * 月末近くに前月分を作ったときに前月の頭が抜けていた。2026-09-23）。
 */
export async function listObservations(userId: string, range: ObservationRange = 90): Promise<ObservationRow[]> {
  const rows = await supabaseRest<unknown>(observationsQuery(userId, range));
  const parsed = z.array(ObservationJoinRow).safeParse(rows);
  if (!parsed.success) return [];
  return parsed.data.map((r) => ({
    brandId: r.brand_id,
    promptId: r.prompt_id,
    keywordId: r.keyword_id,
    citedDomains: r.cited_domains ?? [],
    mentioned: r.mentioned,
    cited: r.cited,
    confidence: r.mention_confidence,
    domainClass: r.domain_class,
    model: (r.geo_measurements?.model ?? "chatgpt") as GeoModel,
    kind: observationKind(r.geo_measurements?.kind, r.prompt_id, r.keyword_id, r.geo_measurements?.model),
    executedAt: r.geo_measurements?.executed_at ?? r.observed_at,
  }));
}

/**
 * 計測の種類が取れなかった行の種類を推す（純関数）。
 * プロンプトの観測（と、どちらにも紐づかない「今すぐ実行」）は LLM、キーワードの観測は model から。
 * キーワードで model = "aio" の行は順位計測と AI Overviews の区別が付かないので、
 * シェアの分母に入れない側（rank）に倒す。
 */
export function observationKind(kind: string | undefined, promptId: string | null, keywordId: string | null, model: string | undefined): MeasurementKind {
  if (kind === "llm" || kind === "rank" || kind === "aio" || kind === "ai_mode") return kind;
  if (promptId || !keywordId) return "llm";
  return model === "ai_mode" ? "ai_mode" : "rank";
}

/** このアカウントが観測に使った計測 1 件（同じ日の二重実行を防ぐのに使う） */
export interface ObservedMeasurement {
  measurementId: string;
  promptId: string | null;
  keywordId: string | null;
  kind: MeasurementKind;
  model: GeoModel;
}

/**
 * ある時刻以降にこのアカウントが観測に使った計測（2026-09-23）。
 * 1 計測にブランド数ぶんの行があるので、計測 ID ごとに 1 件へ畳んで返す。
 */
export async function listObservedMeasurements(userId: string, since: string): Promise<ObservedMeasurement[]> {
  const rows = await supabaseRest<unknown>(
    `${T_OBSERVATION}?select=measurement_id,prompt_id,keyword_id,geo_measurements(kind,model)&user_id=${eq(userId)}&observed_at=${gte(since)}&limit=20000`,
  );
  const parsed = z
    .array(
      z.object({
        measurement_id: z.string(),
        prompt_id: z.string().nullable(),
        keyword_id: z.string().nullable(),
        geo_measurements: z.object({ kind: z.string(), model: z.string() }).nullable(),
      }),
    )
    .safeParse(rows);
  if (!parsed.success) return [];
  const byId = new Map<string, ObservedMeasurement>();
  for (const r of parsed.data) {
    if (!r.geo_measurements || byId.has(r.measurement_id)) continue;
    byId.set(r.measurement_id, {
      measurementId: r.measurement_id,
      promptId: r.prompt_id,
      keywordId: r.keyword_id,
      kind: observationKind(r.geo_measurements.kind, r.prompt_id, r.keyword_id, r.geo_measurements.model),
      model: r.geo_measurements.model as GeoModel,
    });
  }
  return [...byId.values()];
}

/* ───────────── クレジット台帳 ───────────── */

export async function recordCredit(
  userId: string,
  action: CreditAction,
  credits: number,
  measurementId: string | null,
  cacheHit: boolean,
): Promise<void> {
  await supabaseRest(T_LEDGER, {
    method: "POST",
    body: { user_id: userId, action, credits, measurement_id: measurementId, cache_hit: cacheHit },
    prefer: "return=minimal",
  });
}

const LedgerRow = z.object({
  id: z.string(),
  action: z.string(),
  credits: z.number(),
  measurement_id: z.string().nullable(),
  cache_hit: z.boolean(),
  created_at: z.string(),
});

export async function listLedger(userId: string, since: string): Promise<CreditLedgerEntry[]> {
  const rows = await supabaseRest<unknown>(
    `${T_LEDGER}?select=*&user_id=${eq(userId)}&created_at=${gte(since)}&order=created_at.desc&limit=5000`,
  );
  const parsed = z.array(LedgerRow).safeParse(rows);
  return parsed.success
    ? parsed.data.map((r) => ({
        id: r.id,
        action: r.action as CreditAction,
        credits: r.credits,
        measurementId: r.measurement_id,
        cacheHit: r.cache_hit,
        createdAt: r.created_at,
      }))
    : [];
}

export { cacheKey };

/* ───────────── 最近の生成結果（実際の LLM 出力。2026-09-22） ───────────── */

const RecentRow = z.object({
  prompt_id: z.string().nullable(),
  keyword_id: z.string().nullable(),
  mentioned: z.boolean(),
  observed_at: z.string(),
  geo_measurements: z
    .object({ id: z.string(), model: z.string(), executed_at: z.string(), text: z.string(), response_text: z.string().nullable() })
    .nullable(),
});

export interface RecentOutput {
  measurementId: string;
  /** 投げた文（プロンプト or キーワード） */
  text: string;
  /** 回答本文。順位計測のときは空 */
  responseText: string;
  model: GeoModel;
  executedAt: string;
  promptId: string | null;
  keywordId: string | null;
  /** 自社が言及されたか（複数ブランドぶんの行を 1 計測にまとめた結果） */
  mentioned: boolean;
}

/**
 * 直近の計測を新しい順に返す（画面の「最近の生成結果」）。
 *
 * `geo_measurements` は**アカウントをまたいで共有する**（user_id を持たない）ので、
 * **必ず user_id を持つ `geo_observations` から辿る**。同じ計測に複数ブランドの行が
 * あるので、measurement_id でまとめて 1 件にする（自社が出たかは or で畳む）。
 */
export async function listRecentOutputs(userId: string, limit = 20, ownBrandId?: string): Promise<RecentOutput[]> {
  // 1 計測 = ブランド数ぶんの行なので、多めに引いてから畳む
  const rows = await supabaseRest<unknown>(
    `${T_OBSERVATION}?select=prompt_id,keyword_id,mentioned,brand_id,observed_at,geo_measurements(id,model,executed_at,text,response_text)` +
      `&user_id=${eq(userId)}${ownBrandId ? `&brand_id=${eq(ownBrandId)}` : ""}&order=observed_at.desc&limit=${Math.min(500, limit * 8)}`,
  );
  const parsed = z.array(RecentRow).safeParse(rows);
  if (!parsed.success) return [];

  const byMeasurement = new Map<string, RecentOutput>();
  for (const r of parsed.data) {
    const m = r.geo_measurements;
    if (!m) continue;
    // 回答本文が無いもの（順位計測）は「生成結果」ではないので出さない
    const responseText = (m.response_text ?? "").trim();
    if (!responseText) continue;
    const existing = byMeasurement.get(m.id);
    if (existing) {
      existing.mentioned = existing.mentioned || r.mentioned;
      continue;
    }
    byMeasurement.set(m.id, {
      measurementId: m.id,
      text: m.text,
      responseText,
      model: m.model as GeoModel,
      executedAt: m.executed_at,
      promptId: r.prompt_id,
      keywordId: r.keyword_id,
      mentioned: r.mentioned,
    });
    if (byMeasurement.size >= limit) break;
  }
  return [...byMeasurement.values()];
}

/* ───────────── キーワードごとの成果（SEO 順位 × AIO 出現 × 引用。2026-09-22） ───────────── */

const KeywordOutcomeRow = z.object({
  keyword_id: z.string().nullable(),
  cited: z.boolean(),
  geo_measurements: z
    .object({ kind: z.string(), model: z.string(), executed_at: z.string(), rank: z.number().nullable(), citations: z.unknown() })
    .nullable(),
});

/** 1 計測ぶんの生の行（集計は純関数 aggregate.keywordOutcomes に渡す） */
export interface KeywordOutcomeInput {
  keywordId: string;
  kind: MeasurementKind;
  model: GeoModel;
  executedAt: string;
  /** 検索順位（kind="rank" のときだけ入る。圏外は null） */
  rank: number | null;
  /** その計測で拾えた引用リンクの数（0 なら AI の回答そのものが出ていない） */
  citationCount: number;
  /** 自社が引用されたか */
  cited: boolean;
}

/**
 * 観測 1 行 → キーワードの成果の入力（純関数。テスト用に公開）。
 *
 * **順位は計測に残した自然検索の並びから、利用者のドメインで引く**（2026-09-23）。
 * 共有の計測には誰の順位も入っていない（`rank` は常に null）ので、以前は全キーワードが
 * 「圏外」になっていた。並びを保存していない古い順位計測は、圏外ではなく**未計測**として捨てる
 * （「圏外」と言える根拠が無いため）。
 */
export function toKeywordOutcome(row: unknown, ownDomains: readonly string[]): KeywordOutcomeInput | null {
  const parsed = KeywordOutcomeRow.safeParse(row);
  if (!parsed.success) return null;
  const m = parsed.data.geo_measurements;
  const keywordId = parsed.data.keyword_id;
  if (!m || !keywordId) return null;
  const stored = decodeStoredCitations(m.citations);
  let rank = m.rank;
  if (m.kind === "rank") {
    if (stored.organic === null && rank === null) return null;
    if (stored.organic !== null) rank = rankForDomains(stored.organic, ownDomains);
  }
  return {
    keywordId,
    kind: m.kind as MeasurementKind,
    model: m.model as GeoModel,
    executedAt: m.executed_at,
    rank,
    citationCount: stored.citations.length,
    cited: parsed.data.cited,
  };
}

/**
 * キーワード計測（順位・AI Overviews・AI モード）を自社ブランドぶんだけ引く。
 *
 * プロンプト側（LLM）は対象外なので `keyword_id` がある行に絞る。
 * 件数はキーワード数 × 3 種 × 週数なので、観測の全件取得よりずっと軽い。
 * `ownDomains` は自社のドメイン（順位を引くのに使う。サブドメインを含む）。
 */
export async function listKeywordOutcomes(userId: string, ownBrandId: string, days = 28, ownDomains: readonly string[] = []): Promise<KeywordOutcomeInput[]> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const rows = await supabaseRest<unknown>(
    `${T_OBSERVATION}?select=keyword_id,cited,geo_measurements(kind,model,executed_at,rank,citations)` +
      `&user_id=${eq(userId)}&brand_id=${eq(ownBrandId)}&keyword_id=not.is.null&observed_at=${gte(since)}&order=observed_at.desc&limit=5000`,
  );
  if (!Array.isArray(rows)) return [];
  const out: KeywordOutcomeInput[] = [];
  for (const r of rows) {
    const row = toKeywordOutcome(r, ownDomains);
    if (row) out.push(row);
  }
  return out;
}
