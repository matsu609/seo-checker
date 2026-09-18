"use client";

/**
 * 登録情報（会社名・担当者名・電話・店舗の種類・所在地・地域）をブラウザ側で使うためのフック。
 *
 * 利用者の指示（2026-09-19）: アカウント登録時に入れた情報は各ツールが自動で参照し、
 * 書き換えは設定画面（/settings）でできるようにする。
 *
 * 読み込みは /api/account/lead（Clerk のメタデータ）。ClerkProvider の有無に依存しないよう
 * Clerk のフックは使わない。値はページをまたいで使い回すためモジュール内に持つ
 * （localStorage には置かない = 端末を共有していても他の人の情報が残らない）。
 */
import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { LeadProfile, LeadProfileInput } from "@/lib/free/lead";

interface LeadState {
  status: "idle" | "loading" | "ready" | "error";
  lead: LeadProfile | null;
  error: string | null;
}

let state: LeadState = { status: "idle", lead: null, error: null };
const listeners = new Set<() => void>();
let inflight: Promise<void> | null = null;

function emit(next: LeadState) {
  state = next;
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return state;
}

const SERVER_SNAPSHOT: LeadState = { status: "idle", lead: null, error: null };
function getServerSnapshot() {
  return SERVER_SNAPSHOT;
}

async function load(): Promise<void> {
  if (inflight) return inflight;
  emit({ ...state, status: "loading" });
  inflight = (async () => {
    try {
      const res = await fetch("/api/account/lead", { cache: "no-store" });
      if (res.status === 401 || res.status === 403) {
        emit({ status: "ready", lead: null, error: null });
        return;
      }
      const body = (await res.json().catch(() => null)) as { lead?: LeadProfile | null; error?: string } | null;
      if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
      emit({ status: "ready", lead: body?.lead ?? null, error: null });
    } catch (err) {
      emit({ status: "error", lead: state.lead, error: err instanceof Error ? err.message : "登録情報を読み込めませんでした" });
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** 設定画面で保存したあと、開いている画面にも反映する */
export async function saveLeadProfile(input: LeadProfileInput): Promise<LeadProfile> {
  const res = await fetch("/api/account/lead", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = (await res.json().catch(() => null)) as { lead?: LeadProfile; error?: string } | null;
  if (!res.ok || !body?.lead) throw new Error(body?.error ?? `保存できませんでした（HTTP ${res.status}）`);
  emit({ status: "ready", lead: body.lead, error: null });
  return body.lead;
}

/** テスト用: 読み込み済みの値を差し替える */
export function primeLeadProfile(lead: LeadProfile | null): void {
  emit({ status: "ready", lead, error: null });
}

export interface UseLeadProfileResult {
  /** 登録情報。未登録・未ログイン・読み込み前は null */
  lead: LeadProfile | null;
  /** 読み込みが終わったか（null でも終わっていれば true） */
  loaded: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

export function useLeadProfile(): UseLeadProfileResult {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => {
    if (state.status === "idle") void load();
  }, []);
  const reload = useCallback(() => load(), []);
  return { lead: snap.lead, loaded: snap.status === "ready" || snap.status === "error", error: snap.error, reload };
}
