"use client";

/**
 * ブラウザ側ストアとサーバー（/api/store → user_stores）の同期。画面には何も出さない。
 *
 * - ログインしたユーザーが決まったら、サーバーの値を読み込む（sync-rules.ts の hydrationMode）。
 * - 以後、ストアが変わるたびに（少し待ってまとめて）サーバーへ保存する。
 * - 代理ログイン中（actor あり）は読み込むだけで、保存はしない。
 * - Supabase が未設定（503 not_configured）なら、その後の同期は静かにやめる。
 *
 * すべてのストアを対象にするため、all.ts を import して登録を確定させる。
 */
import { useAuth } from "@clerk/nextjs";
import { useEffect, useRef } from "react";
import "./all";
import { allStores, type Store } from "./createStore";
import { hydrationMode, isInitialValue, isSyncedStoreName, OWNER_KEY } from "./sync-rules";

const PUSH_DELAY_MS = 800;

function readOwner(): string | null {
  try {
    return localStorage.getItem(OWNER_KEY);
  } catch {
    return null;
  }
}

function writeOwner(userId: string): void {
  try {
    localStorage.setItem(OWNER_KEY, userId);
  } catch {
    // 無視（保存できない端末では毎回 replace になるだけ）
  }
}

async function push(name: string, value: unknown, initial: unknown): Promise<"ok" | "stop"> {
  const reset = isInitialValue(value, initial);
  const res = await fetch("/api/store", {
    method: reset ? "DELETE" : "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(reset ? { name } : { name, value }),
    cache: "no-store",
  });
  if (res.status === 503 || res.status === 403) return "stop";
  return "ok";
}

export function StoreSync() {
  const { isLoaded, isSignedIn, userId, actor } = useAuth();
  const readOnly = typeof actor?.sub === "string" && actor.sub.length > 0;
  const state = useRef({ applying: false, disabled: false, lastSent: new Map<string, string>() });

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !userId) return;
    const s = state.current;
    s.disabled = false;
    let cancelled = false;
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const stores = allStores().filter((st) => isSyncedStoreName(st.name));

    async function hydrate() {
      const res = await fetch("/api/store", { cache: "no-store" });
      if (res.status === 503) {
        s.disabled = true;
        return;
      }
      if (!res.ok || cancelled) return;
      const body = (await res.json().catch(() => ({}))) as { stores?: Record<string, unknown> };
      const server = body.stores ?? {};
      const mode = hydrationMode({ userId: userId!, previousOwner: readOwner(), serverHasAny: Object.keys(server).length > 0 });
      s.applying = true;
      try {
        for (const st of stores) {
          if (st.name in server) {
            try {
              st.set(server[st.name]);
              s.lastSent.set(st.name, JSON.stringify(server[st.name]));
            } catch {
              // 形が違う古い値は無視（端末の値のまま）
            }
          } else if (mode === "replace") {
            st.reset();
          }
        }
      } finally {
        s.applying = false;
      }
      writeOwner(userId!);
      if (mode === "migrate" && !readOnly) {
        for (const st of stores) {
          const value = st.get();
          if (isInitialValue(value, st.initial)) continue;
          const r = await push(st.name, value, st.initial).catch(() => "ok" as const);
          if (r === "stop") {
            s.disabled = true;
            return;
          }
          s.lastSent.set(st.name, JSON.stringify(value));
        }
      }
    }

    function schedule(st: Store<unknown>) {
      if (s.applying || s.disabled || readOnly) return;
      const existing = timers.get(st.name);
      if (existing) clearTimeout(existing);
      timers.set(
        st.name,
        setTimeout(() => {
          timers.delete(st.name);
          const value = st.get();
          const json = JSON.stringify(value);
          if (s.lastSent.get(st.name) === json) return;
          s.lastSent.set(st.name, json);
          void push(st.name, value, st.initial)
            .then((r) => {
              if (r === "stop") s.disabled = true;
            })
            .catch(() => {
              // 送れなかった分は次の変更でまた送る
              s.lastSent.delete(st.name);
            });
        }, PUSH_DELAY_MS),
      );
    }

    const unsubscribes = stores.map((st) => st.subscribe(() => schedule(st)));
    void hydrate().catch(() => {
      // 読めなくても画面は端末の値で動く
    });

    return () => {
      cancelled = true;
      for (const u of unsubscribes) u();
      for (const t of timers.values()) clearTimeout(t);
    };
  }, [isLoaded, isSignedIn, userId, readOnly]);

  return null;
}
