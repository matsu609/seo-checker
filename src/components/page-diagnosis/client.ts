"use client";

/**
 * ブラウザ側から /api/page-diagnosis/chat の NDJSON ストリームを読むヘルパー。
 *
 * node 専用モジュールを引き込まないよう、行の読み出しは共有の readNdjson
 * （@/lib/crawl/client）から取り、型は types.ts から取る。
 */
import { readNdjson } from "@/lib/crawl/client";
import type { ChatMessage, ChatStreamEvent, DiagnosisResult } from "@/lib/page-diagnosis/types";

function isChatEvent(obj: unknown): obj is ChatStreamEvent {
  if (!obj || typeof obj !== "object") return false;
  const type = (obj as { type?: unknown }).type;
  return type === "delta" || type === "done" || type === "error";
}

export interface ChatRequestOptions {
  result: DiagnosisResult;
  messages: readonly ChatMessage[];
  signal?: AbortSignal;
  /** 断片を受け取るたびに呼ばれる（画面へ即時反映するため） */
  onDelta: (text: string) => void;
}

/** チャットを 1 往復。受信した本文全体を返す */
export async function requestChat(options: ChatRequestOptions): Promise<string> {
  const res = await fetch("/api/page-diagnosis/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ result: options.result, messages: options.messages }),
    ...(options.signal ? { signal: options.signal } : {}),
  });

  if (!res.ok) {
    let message = `チャットに失敗しました（HTTP ${res.status}）`;
    try {
      const data = (await res.json()) as { error?: unknown };
      if (typeof data.error === "string" && data.error) message = data.error;
    } catch {
      /* JSON でなければ既定文言 */
    }
    throw new Error(message);
  }

  let text = "";
  let failure: string | null = null;
  await readNdjson(res, (obj) => {
    if (!isChatEvent(obj)) return;
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
