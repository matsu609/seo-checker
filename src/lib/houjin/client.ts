/**
 * 法人番号システム Web-API（国税庁）のクライアント。サーバー専用。
 *
 * - 利用は無料。**アプリケーション ID**（利用届出で発行）が要る → `HOUJIN_BANGOU_APP_ID`
 * - 使うのは 2 つだけ: `name`（商号で検索）と `num`（法人番号で 1 件）
 * - 応答は XML（`type=12`）。読み方は parse.ts（要素名で引く寛容な読み方）
 *
 * ⚠ **この環境からは実物を呼べない**（2026-09-20 にネットワークポリシーの 403 を確認）。
 * ベース URL・パラメータ名・応答の要素名は公表仕様の記憶に基づく。**実データでの検証が要る。**
 * 差し替えが要るときに 1 か所で済むよう、ベース URL は `HOUJIN_BANGOU_API_BASE` で上書きできる。
 *
 * キーが無ければ何もせず「未設定」を返す（ダミーは返さない）。
 */
import { globalCache } from "@/lib/cache";
import { API_BASE_DEFAULT, CORPORATE_NUMBER_RE, SEARCH_LIMIT, isValidCorporateNumber } from "./constants";
import { parseCorporations, sortCorporations, type Corporation } from "./parse";

const TIMEOUT_MS = 15_000;
/** 登記は頻繁に変わらない。1 日持つ */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export type HoujinFailure = "no-key" | "invalid" | "rate-limit" | "upstream" | "network";

export interface HoujinOutcome {
  corporations: Corporation[];
  /** API が返した総件数（SEARCH_LIMIT で切る前） */
  total: number | null;
  failure: HoujinFailure | null;
  /** 画面にそのまま出す 1 文（成功なら null） */
  message: string | null;
}

const cache = globalCache<HoujinOutcome>("houjin-bangou", CACHE_TTL_MS, 300);

export function houjinAppId(): string | null {
  return process.env.HOUJIN_BANGOU_APP_ID?.trim() || null;
}

export function isHoujinEnabled(): boolean {
  return houjinAppId() !== null;
}

export function houjinApiBase(): string {
  return (process.env.HOUJIN_BANGOU_API_BASE?.trim() || API_BASE_DEFAULT).replace(/\/+$/, "");
}

const NO_KEY: HoujinOutcome = {
  corporations: [],
  total: null,
  failure: "no-key",
  message: "法人番号の照会は設定されていません（HOUJIN_BANGOU_APP_ID が未設定）。国税庁の法人番号システム Web-API の利用届出でアプリケーション ID を取得してください。",
};

export interface HoujinOptions {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  /** テスト用。省略時は環境変数 */
  appId?: string;
  apiBase?: string;
}

/** 応答の HTTP ステータス → 画面に出せる 1 文 */
function messageForStatus(status: number): { failure: HoujinFailure; message: string } {
  if (status === 403 || status === 401) {
    return { failure: "upstream", message: "法人番号システムにアプリケーション ID を拒否されました（HOUJIN_BANGOU_APP_ID をご確認ください）。" };
  }
  if (status === 429) return { failure: "rate-limit", message: "法人番号システムの呼び出し回数の上限に達しました。しばらく待ってからお試しください。" };
  if (status === 400) return { failure: "invalid", message: "法人番号システムが検索条件を受け付けませんでした。会社名を変えてお試しください。" };
  return { failure: "upstream", message: `法人番号システムがエラーを返しました（HTTP ${status}）。` };
}

async function call(url: string, options: HoujinOptions): Promise<HoujinOutcome> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const res = await fetchImpl(url, { headers: { accept: "application/xml" }, signal: controller.signal, cache: "no-store" });
    if (!res.ok) {
      const { failure, message } = messageForStatus(res.status);
      return { corporations: [], total: null, failure, message };
    }
    const page = parseCorporations(await res.text());
    return { corporations: sortCorporations(page.corporations).slice(0, SEARCH_LIMIT), total: page.count, failure: null, message: null };
  } catch {
    return { corporations: [], total: null, failure: "network", message: "法人番号システムに接続できませんでした。時間をおいてお試しください。" };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
  }
}

/** 通信のいらない失敗（キャッシュしない）かどうか */
function shouldCache(outcome: HoujinOutcome): boolean {
  return outcome.failure === null;
}

/**
 * 商号・名称で検索する。
 * `mode=2`（部分一致）で引き、閉鎖した法人も含めて返す（画面側で後ろに回す）。
 */
export async function searchByName(name: string, address: string, options: HoujinOptions = {}): Promise<HoujinOutcome> {
  const appId = options.appId ?? houjinAppId();
  if (!appId) return NO_KEY;
  const query = name.trim();
  if (!query) return { corporations: [], total: null, failure: "invalid", message: "会社名を入力してください。" };

  const key = `name:${query}:${address.trim()}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const params = new URLSearchParams({ id: appId, name: query, type: "12", mode: "2" });
  if (address.trim()) params.set("address", address.trim());
  const outcome = await call(`${(options.apiBase ?? houjinApiBase())}/name?${params.toString()}`, options);
  if (shouldCache(outcome)) cache.set(key, outcome);
  return outcome;
}

/** 法人番号 1 件で引く。13 桁と検査用数字を先に見て、無駄に呼ばない */
export async function fetchByNumber(corporateNumber: string, options: HoujinOptions = {}): Promise<HoujinOutcome> {
  const appId = options.appId ?? houjinAppId();
  if (!appId) return NO_KEY;
  const value = corporateNumber.replace(/\D/g, "");
  if (!CORPORATE_NUMBER_RE.test(value)) return { corporations: [], total: null, failure: "invalid", message: "法人番号は 13 桁の数字です。" };
  if (!isValidCorporateNumber(value)) {
    return { corporations: [], total: null, failure: "invalid", message: "法人番号の検査用数字（先頭 1 桁）が合いません。入力をご確認ください。" };
  }

  const key = `num:${value}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const params = new URLSearchParams({ id: appId, number: value, type: "12" });
  const outcome = await call(`${(options.apiBase ?? houjinApiBase())}/num?${params.toString()}`, options);
  if (shouldCache(outcome)) cache.set(key, outcome);
  return outcome;
}
