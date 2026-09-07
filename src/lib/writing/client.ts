"use client";

/**
 * ブラウザ側から /api/writing/* の NDJSON ストリームを読むヘルパー。
 *
 * node 専用モジュール（SDK・fetch.ts など）を引き込まないよう、
 * 行の読み出しは共有の readNdjson（@/lib/crawl/client）を使い、
 * 型は types.ts からだけ取る。
 */
import { readNdjson } from "@/lib/crawl/client";
import type { ArticleOutline, BodyStreamEvent, RewriteStreamEvent, WritingTone } from "./types";

function isBodyEvent(obj: unknown): obj is BodyStreamEvent {
  if (!obj || typeof obj !== "object") return false;
  const type = (obj as { type?: unknown }).type;
  return (
    type === "section-start" || type === "delta" || type === "section-end" || type === "done" || type === "error"
  );
}

function isRewriteEvent(obj: unknown): obj is RewriteStreamEvent {
  if (!obj || typeof obj !== "object") return false;
  const type = (obj as { type?: unknown }).type;
  return type === "delta" || type === "done" || type === "error";
}

async function postStream(path: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  });
  if (!res.ok) {
    let message = `生成に失敗しました（HTTP ${res.status}）`;
    try {
      const data = (await res.json()) as { error?: unknown };
      if (typeof data.error === "string" && data.error) message = data.error;
    } catch {
      /* JSON でなければ既定文言 */
    }
    throw new Error(message);
  }
  return res;
}

export interface BodyRequestOptions {
  keyword: string;
  outline: ArticleOutline;
  tone: WritingTone;
  signal?: AbortSignal;
  onEvent: (event: BodyStreamEvent) => void;
}

/** 本文生成（見出しごと）。受け取ったイベントをそのまま渡し、全文を返す */
export async function requestBody(options: BodyRequestOptions): Promise<string> {
  const res = await postStream(
    "/api/writing/body",
    { keyword: options.keyword, outline: options.outline, tone: options.tone },
    options.signal,
  );

  const sections: string[] = [];
  let failure: string | null = null;
  await readNdjson(res, (obj) => {
    if (!isBodyEvent(obj)) return;
    if (obj.type === "section-end") sections.push(obj.markdown.trim());
    if (obj.type === "error") failure = obj.error;
    options.onEvent(obj);
  });
  if (failure && sections.length === 0) throw new Error(failure);
  return sections.join("\n\n");
}

export interface RewriteRequestOptions {
  target: string;
  instruction: string;
  selection?: boolean;
  context?: { before?: string; after?: string };
  keyword?: string;
  relatedWords?: readonly string[];
  tone?: WritingTone;
  signal?: AbortSignal;
  onDelta: (text: string) => void;
}

/** リライト。断片を渡しながら、書き換え後の全文を返す */
export async function requestRewrite(options: RewriteRequestOptions): Promise<string> {
  const res = await postStream(
    "/api/writing/rewrite",
    {
      target: options.target,
      instruction: options.instruction,
      selection: options.selection === true,
      ...(options.context ? { context: options.context } : {}),
      ...(options.keyword ? { keyword: options.keyword } : {}),
      ...(options.relatedWords?.length ? { relatedWords: options.relatedWords } : {}),
      ...(options.tone ? { tone: options.tone } : {}),
    },
    options.signal,
  );

  let text = "";
  let failure: string | null = null;
  await readNdjson(res, (obj) => {
    if (!isRewriteEvent(obj)) return;
    if (obj.type === "delta") {
      text += obj.text;
      options.onDelta(obj.text);
    } else if (obj.type === "error") {
      failure = obj.error;
    }
  });
  if (failure) throw new Error(failure);
  return text;
}

/** File → base64（PDF アップロード用。data: URL の接頭辞は落とす） */
export async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** テキストをファイルとしてダウンロードさせる（Markdown / HTML の書き出し） */
export function downloadText(fileName: string, text: string, mimeType: string): void {
  const blob = new Blob([text], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
