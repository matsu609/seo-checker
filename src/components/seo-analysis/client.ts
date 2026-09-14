"use client";

/**
 * ブラウザ側から /api/seo-analysis/* を叩くヘルパー。
 */
import type { AuditProgress } from "@/lib/audit/types";
import { readNdjson } from "@/lib/crawl/client";
import type { AnalysisRecord, Comment, SecondOpinionRecord } from "@/lib/seo-analysis/ai/schema";
import type { CollectStep } from "@/lib/seo-analysis/collect";
import type { RunDetail, RunSummary } from "@/lib/seo-analysis/runs";
import type { AnalysisInput, Fact, SeoFactSheet } from "@/lib/seo-analysis/sheet/types";
import type { Quota } from "@/lib/seo-analysis/quota";

export class SeoAnalysisError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "SeoAnalysisError";
  }
}

async function errorOf(res: Response, fallback: string): Promise<SeoAnalysisError> {
  let message = `${fallback}（HTTP ${res.status}）`;
  let code: string | undefined;
  try {
    const data = (await res.json()) as { error?: unknown; code?: unknown };
    if (typeof data.error === "string") message = data.error;
    if (typeof data.code === "string") code = data.code;
  } catch {
    /* JSON でなければ既定文言 */
  }
  return new SeoAnalysisError(message, code, res.status);
}

export interface CollectProgressEvent {
  step: CollectStep;
  message: string;
  audit?: AuditProgress;
}

export async function requestCollect(
  input: AnalysisInput,
  options: { signal?: AbortSignal; onProgress?: (p: CollectProgressEvent) => void } = {},
): Promise<{ run: RunSummary; sheet: SeoFactSheet }> {
  const res = await fetch("/api/seo-analysis/collect", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    signal: options.signal,
  });
  if (!res.ok) throw await errorOf(res, "収集に失敗しました");

  let done: { run: RunSummary; sheet: SeoFactSheet } | undefined;
  let failure: { error: string; code?: string } | undefined;
  await readNdjson(res, (obj) => {
    if (!obj || typeof obj !== "object") return;
    const ev = obj as { type?: string } & Record<string, unknown>;
    if (ev.type === "progress") {
      options.onProgress?.({ step: ev.step as CollectStep, message: String(ev.message ?? ""), audit: ev.audit as AuditProgress | undefined });
    } else if (ev.type === "result") {
      done = { run: ev.run as RunSummary, sheet: ev.sheet as SeoFactSheet };
    } else if (ev.type === "error") {
      failure = { error: String(ev.error ?? "収集に失敗しました"), code: typeof ev.code === "string" ? ev.code : undefined };
    }
  });
  if (failure) throw new SeoAnalysisError(failure.error, failure.code, res.status);
  if (!done) throw new SeoAnalysisError("結果を受信できませんでした（通信が途中で切れた可能性があります）");
  return done;
}

export async function requestAnalyze(runId: string, signal?: AbortSignal): Promise<{ analysis: AnalysisRecord; analysisCount: number }> {
  const res = await fetch("/api/seo-analysis/analyze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ runId }),
    signal,
  });
  if (!res.ok) throw await errorOf(res, "AI 分析に失敗しました");
  return (await res.json()) as { analysis: AnalysisRecord; analysisCount: number };
}

/** 無効（503）なら null */
export async function requestSecondOpinion(runId: string, signal?: AbortSignal): Promise<SecondOpinionRecord | null> {
  const res = await fetch("/api/seo-analysis/second-opinion", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ runId }),
    signal,
  });
  if (res.status === 503) return null;
  if (!res.ok) throw await errorOf(res, "セカンドオピニオンの生成に失敗しました");
  const data = (await res.json()) as { secondOpinion: SecondOpinionRecord };
  return data.secondOpinion;
}

export interface RunsResponse {
  enabled: boolean;
  runs: RunSummary[];
  quota: Quota | null;
  secondOpinion: boolean;
}

export async function fetchRuns(): Promise<RunsResponse> {
  const res = await fetch("/api/seo-analysis", { cache: "no-store" });
  if (!res.ok) throw await errorOf(res, "履歴を取得できませんでした");
  return (await res.json()) as RunsResponse;
}

export async function fetchRun(id: string): Promise<RunDetail> {
  const res = await fetch(`/api/seo-analysis/${encodeURIComponent(id)}`, { cache: "no-store" });
  if (!res.ok) throw await errorOf(res, "分析を取得できませんでした");
  const data = (await res.json()) as { run: RunDetail };
  return data.run;
}

export async function deleteRunRequest(id: string): Promise<void> {
  const res = await fetch(`/api/seo-analysis/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) throw await errorOf(res, "削除できませんでした");
}

/** 画面ごとの AI 分析。未設定（503）なら null */
export async function requestComment(title: string, facts: Fact[], signal?: AbortSignal): Promise<{ comment: Comment; model: string } | null> {
  const res = await fetch("/api/seo-analysis/comment", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title, facts }),
    signal,
  });
  if (res.status === 503) return null;
  if (!res.ok) throw await errorOf(res, "AI 分析に失敗しました");
  return (await res.json()) as { comment: Comment; model: string };
}
