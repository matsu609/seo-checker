/**
 * ブラウザ側の永続化（localStorage + zod）。
 *
 * - キーは `seo-checker:v1:<name>` で統一する。
 * - 読み出し時に zod で検証し、壊れていれば初期値に戻す（例外は投げない）。
 * - SSR では localStorage が無いので初期値を返す（Server Component からも import できる）。
 * - React からは hooks.ts の `useStore(store)` で購読する（useSyncExternalStore）。
 * - 設定画面の JSON エクスポート / インポートは exportAll / importAll。
 */
import type { z } from "zod";

export const KEY_PREFIX = "seo-checker:v1:";
export const EXPORT_VERSION = 1;

type Listener = () => void;

export interface Store<T> {
  readonly name: string;
  /** localStorage のキー */
  readonly key: string;
  readonly schema: z.ZodType<T>;
  readonly initial: T;
  /** 現在値。サーバーでは initial。参照は値が変わるまで安定している */
  get(): T;
  /** 検証して保存し、購読者に通知する。検証に失敗したら例外 */
  set(value: T): void;
  update(fn: (prev: T) => T): void;
  /** 初期値に戻す（キーも削除） */
  reset(): void;
  subscribe(listener: Listener): () => void;
}

/** 生成済みストアの一覧（exportAll / importAll 用） */
const registry = new Map<string, Store<unknown>>();

function storageAvailable(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage !== null;
  } catch {
    // Safari のプライベートモード等で参照自体が例外になることがある
    return false;
  }
}

function readRaw(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeRaw(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    // 容量超過など。メモリ上の値だけ更新して続行する
    return false;
  }
}

function removeRaw(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // 無視
  }
}

export function createStore<T>(name: string, schema: z.ZodType<T>, initial: T): Store<T> {
  if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name)) {
    throw new Error(`store name must be alphanumeric: ${name}`);
  }
  const key = KEY_PREFIX + name;
  const listeners = new Set<Listener>();
  let cached: { value: T } | null = null;
  let storageListener: ((e: StorageEvent) => void) | null = null;

  function parse(raw: string | null): T {
    if (raw === null) return initial;
    try {
      const result = schema.safeParse(JSON.parse(raw));
      return result.success ? result.data : initial;
    } catch {
      return initial;
    }
  }

  function notify(): void {
    for (const l of Array.from(listeners)) l();
  }

  const store: Store<T> = {
    name,
    key,
    schema,
    initial,
    get() {
      if (!storageAvailable()) return initial;
      if (!cached) cached = { value: parse(readRaw(key)) };
      return cached.value;
    },
    set(value) {
      const result = schema.safeParse(value);
      if (!result.success) {
        throw new Error(`[store:${name}] 保存する値が不正です: ${result.error.message}`);
      }
      cached = { value: result.data };
      if (storageAvailable()) writeRaw(key, JSON.stringify(result.data));
      notify();
    },
    update(fn) {
      store.set(fn(store.get()));
    },
    reset() {
      cached = { value: initial };
      if (storageAvailable()) removeRaw(key);
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      // 別タブでの変更を拾う。最初の購読者が付いたときだけ登録する
      if (!storageListener && typeof window !== "undefined" && typeof window.addEventListener === "function") {
        storageListener = (e: StorageEvent) => {
          if (e.key === null || e.key === key) {
            cached = null;
            notify();
          }
        };
        window.addEventListener("storage", storageListener);
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && storageListener && typeof window !== "undefined") {
          window.removeEventListener("storage", storageListener);
          storageListener = null;
        }
      };
    },
  };

  // dev の HMR で同じ名前が再登録されることがあるので上書きする
  registry.set(name, store as Store<unknown>);
  return store;
}

/** 登録済みストア名（テスト・設定画面の表示用） */
export function storeNames(): string[] {
  return Array.from(registry.keys());
}

/** 全ストアを初期値に戻す（設定画面の「すべて削除」） */
export function resetAll(): void {
  for (const store of registry.values()) store.reset();
}

export interface ExportEnvelope {
  app: "seo-checker";
  version: number;
  exportedAt: string;
  stores: Record<string, unknown>;
}

/** 全ストアの現在値を 1 つの JSON にまとめる */
export function exportAll(): ExportEnvelope {
  const stores: Record<string, unknown> = {};
  for (const [name, store] of registry) stores[name] = store.get();
  return { app: "seo-checker", version: EXPORT_VERSION, exportedAt: new Date().toISOString(), stores };
}

export interface ImportResult {
  imported: string[];
  /** 検証に失敗した・未知のストア名 */
  skipped: string[];
}

/**
 * exportAll の JSON を読み込む。ストアごとに zod で検証し、通ったものだけ保存する。
 * 形式が違えば例外（日本語メッセージ）。
 */
export function importAll(json: string | unknown): ImportResult {
  let data: unknown = json;
  if (typeof json === "string") {
    try {
      data = JSON.parse(json);
    } catch {
      throw new Error("JSON として読み込めませんでした");
    }
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("エクスポートファイルの形式が違います");
  }
  const env = data as Partial<ExportEnvelope>;
  if (env.app !== "seo-checker" || !env.stores || typeof env.stores !== "object") {
    throw new Error("SEO Checker のエクスポートファイルではありません");
  }
  if (typeof env.version === "number" && env.version > EXPORT_VERSION) {
    throw new Error("新しいバージョンのエクスポートファイルです。アプリを更新してください");
  }
  const result: ImportResult = { imported: [], skipped: [] };
  for (const [name, value] of Object.entries(env.stores)) {
    const store = registry.get(name);
    if (!store) {
      result.skipped.push(name);
      continue;
    }
    const parsed = store.schema.safeParse(value);
    if (!parsed.success) {
      result.skipped.push(name);
      continue;
    }
    store.set(parsed.data);
    result.imported.push(name);
  }
  return result;
}

/** ID 生成（プロジェクト・競合など） */
export function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
