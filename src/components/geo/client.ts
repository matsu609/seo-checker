"use client";

/**
 * AI 検索モニタリングの API クライアント（画面から呼ぶ薄い層）。
 */
import type { LabeledTargetShare, WeeklySeries } from "@/lib/geo/aggregate";
import type { GeoBrand, GeoKeyword, GeoModel, GeoPrompt, MentionPlatform } from "@/lib/geo/types";

export interface GeoAccountView {
  userId: string;
  creditBalance: number;
  creditResetAt: string;
  runDayOffset: number;
  precisionSlots: number;
  createdAt: string;
}

export interface SetupResponse {
  account: GeoAccountView;
  /** 設定（/settings）のホームページ・競合から同期したもの（この画面では編集しない） */
  brands: GeoBrand[];
  prompts: GeoPrompt[];
  /** 設定の対策キーワードから同期したもの */
  keywords: GeoKeyword[];
  settings: { siteRegistered: boolean; keywordCount: number };
}

export interface ShareRow {
  brandId: string;
  n: number;
  mentions: number;
  citations: number;
  shareMention: number;
  shareCitation: number;
  ciLow: number;
  ciHigh: number;
  band: "often" | "sometimes" | "rare" | "none";
}

/** 計測対象（プロンプト 1 本 / キーワード 1 語）ごとの出現率。棒グラフの 1 行 */
export type TargetRow = LabeledTargetShare;

export interface DashboardResponse {
  account: GeoAccountView;
  brands: GeoBrand[];
  promptCount: number;
  precisionCount: number;
  overall: ShareRow[];
  perModel: Record<string, ShareRow[]>;
  /** プロンプトごとの言及率（ChatGPT / Gemini） */
  perPrompt: TargetRow[];
  /** キーワードごとの AI Overviews 引用率 */
  perKeyword: TargetRow[];
  /** 週ごとの推移（折れ線グラフ）。weeks は週初（月曜）の並び */
  trends: { weeks: string[]; prompt: WeeklySeries[]; keyword: WeeklySeries[] };
  keywordCount: number;
  branded: {
    ownCitationRate: number;
    citationMix: Record<"own" | "competitor" | "third_party", number>;
    competitorCoMentionRate: number;
    n: number;
  } | null;
  versions: { model: GeoModel; versionFrom: string | null; versionTo: string; detectedAt: string }[];
  credits: {
    balance: number;
    spent: number;
    byAction: Record<string, number>;
    forecast: { total: number; remaining: number };
  };
  needsReview: number;
}

async function json<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
  if (!body) throw new Error("応答を読めませんでした");
  return body;
}

export async function fetchSetup(): Promise<SetupResponse> {
  return json<SetupResponse>(await fetch("/api/geo/setup", { cache: "no-store" }));
}

export async function fetchDashboard(): Promise<DashboardResponse> {
  return json<DashboardResponse>(await fetch("/api/geo/dashboard", { cache: "no-store" }));
}

export async function saveSetup(body: unknown): Promise<{ ok: boolean; warning?: string | null }> {
  return json(await fetch("/api/geo/setup", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }));
}

export interface LiveResult {
  ok: boolean;
  message: string;
  creditsUsed: number;
  balance: number;
  responseText: string;
  citations: { url: string; domain: string; unresolved: boolean }[];
  mentioned: { brandId: string; displayName: string; mentioned: boolean; confidence: number }[];
}

export async function runLive(text: string, model: GeoModel): Promise<LiveResult> {
  const res = await fetch("/api/geo/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, model }) });
  const body = (await res.json().catch(() => null)) as (LiveResult & { error?: string }) | null;
  if (!body) throw new Error("応答を読めませんでした");
  if (!res.ok && body.error) throw new Error(body.error);
  return body;
}

/* ───────────── 業界の地図（LLM Mentions。#126） ───────────── */

export interface IndustryMapRow {
  domain: string;
  mentions: number;
  aiSearchVolume: number | null;
  isOwn: boolean;
  isCompetitor: boolean;
}

export interface IndustryMapResponse {
  ok: boolean;
  message: string;
  creditsUsed: number;
  balance: number;
  report: { rows: IndustryMapRow[]; totalCount: number | null; ownRank: number | null; costUsd: number | null } | null;
}

export async function runIndustryMap(keyword: string, platform: MentionPlatform): Promise<IndustryMapResponse> {
  const res = await fetch("/api/geo/mentions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ keyword, platform }),
  });
  const body = (await res.json().catch(() => null)) as (IndustryMapResponse & { error?: string }) | null;
  if (!body) throw new Error("応答を読めませんでした");
  if (!res.ok && body.error) throw new Error(body.error);
  return body;
}
