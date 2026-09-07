/**
 * ツール画面から API を叩くときの共通フック。
 *
 * 「送信中 / 成功 / 失敗」の状態と中止（AbortController）の面倒を 1 箇所に集める。
 * 各ツールが同じ形のエラー表示になるようにするのが目的。
 */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RunState<T> =
  | { phase: "idle" }
  | { phase: "running" }
  | { phase: "error"; message: string }
  | { phase: "done"; data: T };

/** API のエラー応答（全ルート共通の形） */
async function messageFromResponse(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error) return body.error;
  } catch {
    // JSON でない応答（プロキシのエラーページなど）
  }
  return `リクエストに失敗しました（HTTP ${res.status}）`;
}

export function useToolRun<T>() {
  const [state, setState] = useState<RunState<T>>({ phase: "idle" });
  const controller = useRef<AbortController | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      controller.current?.abort();
    };
  }, []);

  const cancel = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    if (alive.current) setState({ phase: "idle" });
  }, []);

  const run = useCallback(async (path: string, body: unknown): Promise<T | null> => {
    controller.current?.abort();
    const ac = new AbortController();
    controller.current = ac;
    setState({ phase: "running" });
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: ac.signal,
      });
      if (!res.ok) throw new Error(await messageFromResponse(res));
      const data = (await res.json()) as T;
      // 中止済み・アンマウント済みなら結果を捨てる（古い応答で画面を上書きしない）
      if (ac.signal.aborted || !alive.current || controller.current !== ac) return null;
      setState({ phase: "done", data });
      return data;
    } catch (err) {
      if (ac.signal.aborted || !alive.current) return null;
      const message = err instanceof Error ? err.message : "リクエストに失敗しました";
      setState({ phase: "error", message });
      return null;
    } finally {
      if (controller.current === ac) controller.current = null;
    }
  }, []);

  const reset = useCallback(() => setState({ phase: "idle" }), []);

  return { state, run, cancel, reset };
}
