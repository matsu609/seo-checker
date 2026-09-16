/**
 * DataForSEO のクライアント（仕様書 §1.1）。サーバー専用。
 *
 * 使うエンドポイントは 3 つだけ:
 *   検索順位  POST /v3/serp/google/organic/task_post（+ task_get）
 *   AIO      同上 + `load_async_ai_overview: true`
 *   LLM 計測  POST /v3/ai_optimization/{chat_gpt|gemini}/llm_responses/task_post（標準キュー）
 *            Live は /live/... （**オンデマンドのみ**。§7.4）
 *
 * 認証は Basic（login:password を base64）。`DATAFORSEO_LOGIN` と
 * `DATAFORSEO_PASSWORD` の両方が無ければ何もしない。
 *
 * **定期実行から Live を呼ぶ経路は作らない**（§7.4）。`mode: "live"` は
 * オンデマンド API からしか渡ってこないよう、呼び出し側で保証する。
 */
import { normalizeDomain } from "./normalize";
import type { GeoProvider, ProviderOutcome, ProviderRequest, ProviderResult } from "./provider";
import type { GeoCitation } from "./types";

export const DATAFORSEO_BASE = "https://api.dataforseo.com/v3";
const TIMEOUT_MS = 30_000;

export function dataForSeoCredentials(): { login: string; password: string } | null {
  const login = process.env.DATAFORSEO_LOGIN?.trim();
  const password = process.env.DATAFORSEO_PASSWORD?.trim();
  return login && password ? { login, password } : null;
}

export function isDataForSeoConfigured(): boolean {
  return dataForSeoCredentials() !== null;
}

function authHeader(login: string, password: string): string {
  return `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`;
}

/** ロケール（既定は日本）。§11 の「ロケール」は日本固定 + 設定で変更可 にした */
export function defaultLocale(): string {
  return process.env.GEO_LOCALE?.trim() || "ja";
}

const LOCATION_BY_LOCALE: Record<string, { locationName: string; languageCode: string }> = {
  ja: { locationName: "Japan", languageCode: "ja" },
  en: { locationName: "United States", languageCode: "en" },
};

export function localeParams(locale: string): { locationName: string; languageCode: string } {
  return LOCATION_BY_LOCALE[locale] ?? LOCATION_BY_LOCALE.ja;
}

/** LLM 計測のパス。標準キュー（task_post）と Live を明確に分ける */
export function llmPath(model: "chatgpt" | "gemini", mode: "standard" | "live"): string {
  const vendor = model === "chatgpt" ? "chat_gpt" : "gemini";
  return mode === "live"
    ? `/ai_optimization/${vendor}/llm_responses/live`
    : `/ai_optimization/${vendor}/llm_responses/task_post`;
}

/* ───────────── 応答の読み取り（純関数。テストしやすいように分ける） ───────────── */

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

/** DataForSEO の包み（tasks[0].result[0]）を剥がす */
export function unwrapTask(payload: unknown): Record<string, unknown> | null {
  const tasks = asArray(asRecord(payload).tasks);
  const first = asRecord(tasks[0]);
  const status = typeof first.status_code === "number" ? first.status_code : null;
  if (status !== null && status >= 40000) return null;
  const result = asArray(first.result);
  return result.length > 0 ? asRecord(result[0]) : null;
}

/** 文字列っぽい値を拾う */
function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** LLM の応答から本文と引用を取り出す */
export function parseLlmResult(payload: unknown): ProviderResult | null {
  const result = unwrapTask(payload);
  if (!result) return null;

  const items = asArray(result.items);
  const texts: string[] = [];
  const citations: GeoCitation[] = [];

  for (const raw of items) {
    const item = asRecord(raw);
    const sections = asArray(item.sections);
    for (const rawSection of sections) {
      const section = asRecord(rawSection);
      const text = str(section.text);
      if (text) texts.push(text);
      for (const rawLink of asArray(section.annotations)) {
        const link = asRecord(rawLink);
        const url = str(link.url);
        if (!url) continue;
        citations.push({ url, unresolved: false, domain: normalizeDomain(url), title: str(link.text) });
      }
    }
    const text = str(item.text);
    if (text) texts.push(text);
  }

  return {
    responseText: texts.join("\n").trim(),
    citations: dedupeCitations(citations),
    rank: null,
    modelVersion: str(result.model_name) ?? str(asRecord(items[0]).model_name),
    costUsd: typeof asRecord(payload).cost === "number" ? (asRecord(payload).cost as number) : null,
  };
}

/** 検索結果（順位・AI Overviews）から順位と AIO の参照リンクを取り出す */
export function parseSerpResult(payload: unknown, targetDomains: readonly string[] = []): ProviderResult | null {
  const result = unwrapTask(payload);
  if (!result) return null;

  const items = asArray(result.items);
  const citations: GeoCitation[] = [];
  const texts: string[] = [];
  let rank: number | null = null;

  for (const raw of items) {
    const item = asRecord(raw);
    const type = str(item.type);

    if (type === "organic" && rank === null && targetDomains.length > 0) {
      const domain = normalizeDomain(str(item.domain) ?? str(item.url) ?? "");
      if (domain && targetDomains.some((d) => domain === d || domain.endsWith(`.${d}`))) {
        const position = typeof item.rank_absolute === "number" ? item.rank_absolute : null;
        rank = position;
      }
    }

    if (type === "ai_overview" || type === "ai_overview_element") {
      for (const rawRef of [...asArray(item.references), ...asArray(item.items)]) {
        const ref = asRecord(rawRef);
        const url = str(ref.url);
        if (url) citations.push({ url, unresolved: false, domain: normalizeDomain(url), title: str(ref.title) });
        const text = str(ref.text);
        if (text) texts.push(text);
      }
      const text = str(item.text);
      if (text) texts.push(text);
    }
  }

  return {
    responseText: texts.join("\n").trim(),
    citations: dedupeCitations(citations),
    rank,
    modelVersion: null,
    costUsd: typeof asRecord(payload).cost === "number" ? (asRecord(payload).cost as number) : null,
  };
}

export function dedupeCitations(citations: readonly GeoCitation[]): GeoCitation[] {
  const seen = new Set<string>();
  const out: GeoCitation[] = [];
  for (const c of citations) {
    if (seen.has(c.url)) continue;
    seen.add(c.url);
    out.push(c);
  }
  return out;
}

/* ───────────── クライアント ───────────── */

export interface DataForSeoOptions {
  fetchImpl?: typeof fetch;
}

export function createDataForSeoProvider(options: DataForSeoOptions = {}): GeoProvider {
  const fetchImpl = options.fetchImpl ?? fetch;

  async function post(path: string, body: unknown, signal?: AbortSignal): Promise<{ ok: boolean; status: number; payload: unknown }> {
    const credentials = dataForSeoCredentials();
    if (!credentials) return { ok: false, status: 0, payload: null };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const onAbort = () => controller.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const res = await fetchImpl(`${DATAFORSEO_BASE}${path}`, {
        method: "POST",
        headers: {
          authorization: authHeader(credentials.login, credentials.password),
          "content-type": "application/json",
        },
        body: JSON.stringify([body]),
        signal: controller.signal,
        cache: "no-store",
      });
      const payload: unknown = res.ok ? await res.json() : null;
      return { ok: res.ok, status: res.status, payload };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  }

  return {
    id: "dataforseo",
    async run(request: ProviderRequest): Promise<ProviderOutcome> {
      if (!dataForSeoCredentials()) {
        return { result: null, failure: "no-key", message: "DataForSEO は未設定です（DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD）" };
      }
      const { locationName, languageCode } = localeParams(request.locale);

      try {
        if (request.kind === "llm") {
          if (request.model === "aio") {
            return { result: null, failure: "unsupported", message: "AI Overviews は検索結果側から取得します" };
          }
          const path = llmPath(request.model, request.mode);
          const res = await post(
            path,
            {
              user_prompt: request.text,
              // 標準キューを既定にする。Live はパスそのものが別（§7.4）
              web_search: true,
              language_code: languageCode,
            },
            request.signal,
          );
          if (!res.ok) return httpFailure(res.status);
          const parsed = parseLlmResult(res.payload);
          return parsed
            ? { result: parsed, failure: null, message: null }
            : { result: null, failure: "upstream", message: "DataForSEO の応答を解釈できませんでした" };
        }

        // 検索順位・AI Overviews は同じ SERP のエンドポイント（§1.1）
        const res = await post(
          "/serp/google/organic/live/advanced",
          {
            keyword: request.text,
            location_name: locationName,
            language_code: languageCode,
            ...(request.kind === "aio" ? { load_async_ai_overview: true } : {}),
          },
          request.signal,
        );
        if (!res.ok) return httpFailure(res.status);
        const parsed = parseSerpResult(res.payload);
        return parsed
          ? { result: parsed, failure: null, message: null }
          : { result: null, failure: "upstream", message: "DataForSEO の応答を解釈できませんでした" };
      } catch {
        return { result: null, failure: "network", message: "DataForSEO に接続できませんでした" };
      }
    },
  };
}

function httpFailure(status: number): ProviderOutcome {
  if (status === 429) return { result: null, failure: "rate-limit", message: "DataForSEO の回数制限に達しました" };
  if (status === 401 || status === 403) {
    return { result: null, failure: "no-key", message: "DataForSEO の認証に失敗しました（DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD を確認してください）" };
  }
  return { result: null, failure: "upstream", message: `DataForSEO がエラーを返しました（HTTP ${status}）` };
}

/** 設定されていれば プロバイダ を返す。未設定なら null（ダミーは返さない） */
export function getGeoProvider(options: DataForSeoOptions = {}): GeoProvider | null {
  return isDataForSeoConfigured() ? createDataForSeoProvider(options) : null;
}
