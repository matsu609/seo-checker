"use client";

/**
 * AI 検索モニタリングの API クライアント（画面から呼ぶ薄い層）。
 */
import type { GeoBrand, GeoKeyword, GeoModel, GeoPrompt } from "@/lib/geo/types";

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
  brands: GeoBrand[];
  prompts: GeoPrompt[];
  keywords: GeoKeyword[];
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

export interface DashboardResponse {
  account: GeoAccountView;
  brands: GeoBrand[];
  promptCount: number;
  precisionCount: number;
  overall: ShareRow[];
  perModel: Record<string, ShareRow[]>;
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
