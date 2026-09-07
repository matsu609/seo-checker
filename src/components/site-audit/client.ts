"use client";

/**
 * ブラウザ側から /api/site-audit の NDJSON ストリームを読むヘルパー。
 *
 * node 専用モジュールを引き込まないよう、型は @/lib/audit/types から、
 * 行の読み出しは共有の readNdjson（@/lib/crawl/client）から取る。
 */

import type { AuditProgress, AuditResult, AuditStreamEvent } from "@/lib/audit/types";
import { readNdjson } from "@/lib/crawl/client";

export class AuditRequestError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "AuditRequestError";
  }
}

function isAuditEvent(obj: unknown): obj is AuditStreamEvent {
  if (!obj || typeof obj !== "object") return false;
  const type = (obj as { type?: unknown }).type;
  return type === "progress" || type === "result" || type === "error";
}

export interface RequestAuditOptions {
  maxPages?: number;
  /** キャッシュを無視して取り直す */
  refresh?: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: AuditProgress) => void;
}

/** 診断を実行し、進捗を受け取りながら最終結果を返す */
export async function requestAudit(
  url: string,
  options: RequestAuditOptions = {},
): Promise<{ result: AuditResult; cached: boolean }> {
  const res = await fetch("/api/site-audit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url,
      ...(options.maxPages !== undefined ? { maxPages: options.maxPages } : {}),
      ...(options.refresh ? { refresh: true } : {}),
    }),
    signal: options.signal,
  });

  if (!res.ok) {
    let message = `診断に失敗しました（HTTP ${res.status}）`;
    let code: string | undefined;
    try {
      const data = (await res.json()) as { error?: unknown; code?: unknown };
      if (typeof data.error === "string") message = data.error;
      if (typeof data.code === "string") code = data.code;
    } catch {
      /* JSON でなければ既定文言 */
    }
    throw new AuditRequestError(message, code, res.status);
  }

  let done: { result: AuditResult; cached: boolean } | undefined;
  let failure: { error: string; code?: string } | undefined;

  await readNdjson(res, (obj) => {
    if (!isAuditEvent(obj)) return;
    if (obj.type === "progress") {
      const { type: _type, ...progress } = obj;
      void _type;
      options.onProgress?.(progress);
    } else if (obj.type === "result") {
      done = { result: obj.result, cached: Boolean(obj.cached) };
    } else {
      failure = { error: obj.error, code: obj.code };
    }
  });

  if (failure) throw new AuditRequestError(failure.error, failure.code, res.status);
  if (!done) {
    throw new AuditRequestError("診断結果を受信できませんでした（通信が途中で切れた可能性があります）");
  }
  return done;
}

/** AI サマリーを要求する。未設定（503）のときは null を返す */
export async function requestAuditSummary(
  result: AuditResult,
  signal?: AbortSignal,
): Promise<AuditResult["summary"] | null> {
  const res = await fetch("/api/site-audit/summary", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ result }),
    signal,
  });
  if (res.status === 503) return null;
  if (!res.ok) {
    let message = `AI サマリーの生成に失敗しました（HTTP ${res.status}）`;
    try {
      const data = (await res.json()) as { error?: unknown };
      if (typeof data.error === "string") message = data.error;
    } catch {
      /* JSON でなければ既定文言 */
    }
    throw new AuditRequestError(message, undefined, res.status);
  }
  const data = (await res.json()) as { summary?: AuditResult["summary"] };
  return data.summary ?? null;
}
