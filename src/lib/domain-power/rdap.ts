/**
 * RDAP（ドメイン登録情報）からドメインの登録日を取る。サーバー専用。
 *
 * WHOIS の後継で、公開情報・無料・API キー不要。`rdap.org` が
 * IANA のブートストラップを見て各レジストリの RDAP サーバーへ転送する。
 * RDAP を出していない TLD（日本の一部の属性型 JP など）は 404 が返るので、
 * そのときは「不明」として扱い、報告書は止めない。
 *
 * 送るのは登録ドメインだけ（利用者が入れた URL のパスは渡さない）。
 */
import { globalCache } from "@/lib/cache";
import { isQueryableDomain } from "./domain";

export const RDAP_ENDPOINT = "https://rdap.org/domain/";
const TIMEOUT_MS = 8_000;
/** 登録日は変わらないので長めに持つ（プロセス内） */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface RdapDomain {
  domain: string;
  /** 登録日（ISO）。RDAP に registration イベントが無ければ null */
  registeredAt: string | null;
  /** 直近の更新日（ISO）。無ければ null */
  updatedAt: string | null;
  /** 有効期限（ISO）。無ければ null */
  expiresAt: string | null;
  /** レジストラ名（分かれば） */
  registrar: string | null;
}

export type RdapFailure = "invalid" | "not-found" | "upstream" | "network";

export interface RdapOutcome {
  result: RdapDomain | null;
  failure: RdapFailure | null;
  message: string | null;
}

const cache = globalCache<RdapOutcome>("rdap-domain", CACHE_TTL_MS, 300);

export interface RdapOptions {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

/** RDAP の events から eventAction が一致するものの日付を取る */
export function eventDate(payload: unknown, action: string): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const events = (payload as { events?: unknown }).events;
  if (!Array.isArray(events)) return null;
  for (const e of events) {
    if (typeof e !== "object" || e === null) continue;
    const row = e as { eventAction?: unknown; eventDate?: unknown };
    if (row.eventAction !== action || typeof row.eventDate !== "string") continue;
    const t = Date.parse(row.eventDate);
    if (Number.isFinite(t)) return new Date(t).toISOString();
  }
  return null;
}

/** entities の中から registrar の役割を持つものの名前を取る */
export function registrarName(payload: unknown): string | null {
  if (typeof payload !== "object" || payload === null) return null;
  const entities = (payload as { entities?: unknown }).entities;
  if (!Array.isArray(entities)) return null;
  for (const e of entities) {
    if (typeof e !== "object" || e === null) continue;
    const row = e as { roles?: unknown; vcardArray?: unknown };
    if (!Array.isArray(row.roles) || !row.roles.includes("registrar")) continue;
    const vcard = Array.isArray(row.vcardArray) ? row.vcardArray[1] : null;
    if (!Array.isArray(vcard)) continue;
    for (const field of vcard) {
      if (Array.isArray(field) && field[0] === "fn" && typeof field[3] === "string" && field[3].trim()) {
        return field[3].trim().slice(0, 100);
      }
    }
  }
  return null;
}

export function parseRdap(domain: string, payload: unknown): RdapDomain {
  return {
    domain,
    registeredAt: eventDate(payload, "registration"),
    updatedAt: eventDate(payload, "last changed"),
    expiresAt: eventDate(payload, "expiration"),
    registrar: registrarName(payload),
  };
}

export async function fetchRdapDomain(domain: string, options: RdapOptions = {}): Promise<RdapOutcome> {
  if (!isQueryableDomain(domain)) {
    return { result: null, failure: "invalid", message: "ドメイン名を判定できませんでした" };
  }
  const hit = cache.get(domain);
  if (hit) return hit;

  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const onAbort = () => controller.abort();
  options.signal?.addEventListener("abort", onAbort, { once: true });
  let outcome: RdapOutcome;
  try {
    const res = await fetchImpl(`${RDAP_ENDPOINT}${encodeURIComponent(domain)}`, {
      headers: { accept: "application/rdap+json, application/json" },
      signal: controller.signal,
      cache: "no-store",
      redirect: "follow",
    });
    if (res.status === 404) {
      outcome = { result: null, failure: "not-found", message: "この TLD は RDAP（公開の登録情報）に対応していないか、登録がありません" };
    } else if (!res.ok) {
      outcome = { result: null, failure: "upstream", message: `RDAP がエラーを返しました（HTTP ${res.status}）` };
    } else {
      const payload: unknown = await res.json();
      const parsed = parseRdap(domain, payload);
      outcome = parsed.registeredAt
        ? { result: parsed, failure: null, message: null }
        : { result: parsed, failure: null, message: "RDAP に登録日の記載がありませんでした" };
    }
  } catch {
    outcome = { result: null, failure: "network", message: "RDAP に接続できませんでした" };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", onAbort);
  }
  if (outcome.failure !== "network") cache.set(domain, outcome);
  return outcome;
}
