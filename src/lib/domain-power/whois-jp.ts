/**
 * JPRS の WHOIS（whois.jprs.jp、TCP 43 番）から .jp ドメインの登録日を取る。サーバー専用。
 *
 * JPRS は RDAP を出していないので、rdap.org は .jp に 404 を返す（2026-09-19 時点）。
 * お客様の大半が .jp / .co.jp なので、そこだけ WHOIS で補う。公開情報・無料・キー不要。
 * 送るのは登録ドメインだけ（`/e` は英語表記の指定）。失敗しても報告書は止めない。
 */
import { createConnection } from "node:net";
import { globalCache } from "@/lib/cache";
import { isQueryableDomain } from "./domain";

export const JPRS_WHOIS_HOST = "whois.jprs.jp";
const TIMEOUT_MS = 8_000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_BYTES = 64 * 1024;

export interface WhoisJpOutcome {
  registeredAt: string | null;
  failure: "invalid" | "not-jp" | "not-found" | "network" | null;
  message: string | null;
}

const cache = globalCache<WhoisJpOutcome>("whois-jp", CACHE_TTL_MS, 300);

export function isJpDomain(domain: string): boolean {
  return /\.jp$/i.test(domain.trim());
}

/**
 * 応答から登録日を取る（純粋関数）。
 * 汎用 JP: `[Registered Date]  2015/03/24`、属性型（co.jp など）: `[登録年月日]` か `[Created on]`。
 */
export function parseJprsRegisteredAt(text: string): string | null {
  const m = /\[(?:Registered Date|登録年月日|Created on)\]\s*(\d{4})[/-](\d{1,2})[/-](\d{1,2})/i.exec(text);
  if (!m) return null;
  const [, y, mo, d] = m;
  const t = Date.UTC(Number(y), Number(mo) - 1, Number(d));
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString();
}

export function isJprsNotFound(text: string): boolean {
  return /No match!!|該当するデータがありません/i.test(text);
}

/** TCP 43 番で 1 往復する（テストでは query を差し替える） */
export function queryWhois(domain: string, options: { signal?: AbortSignal } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = createConnection({ host: JPRS_WHOIS_HOST, port: 43 });
    const chunks: Buffer[] = [];
    let received = 0;
    const timer = setTimeout(() => socket.destroy(new Error("timeout")), TIMEOUT_MS);
    const onAbort = () => socket.destroy(new Error("aborted"));
    options.signal?.addEventListener("abort", onAbort, { once: true });
    const finish = (err: Error | null) => {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", onAbort);
      if (err) reject(err);
      else resolve(Buffer.concat(chunks).toString("utf8"));
    };
    socket.once("connect", () => socket.write(`${domain}/e\r\n`));
    socket.on("data", (c: Buffer) => {
      received += c.length;
      if (received > MAX_BYTES) {
        socket.destroy(new Error("too large"));
        return;
      }
      chunks.push(c);
    });
    socket.once("error", (err) => finish(err));
    socket.once("close", (hadError) => {
      if (!hadError) finish(null);
    });
  });
}

export interface WhoisJpOptions {
  signal?: AbortSignal;
  /** テスト用の差し替え */
  query?: (domain: string, options: { signal?: AbortSignal }) => Promise<string>;
}

export async function fetchJpRegisteredAt(domain: string, options: WhoisJpOptions = {}): Promise<WhoisJpOutcome> {
  const d = domain.trim().toLowerCase();
  if (!isQueryableDomain(d)) return { registeredAt: null, failure: "invalid", message: "ドメイン名を判定できませんでした" };
  if (!isJpDomain(d)) return { registeredAt: null, failure: "not-jp", message: null };
  const hit = cache.get(d);
  if (hit) return hit;
  let outcome: WhoisJpOutcome;
  try {
    const text = await (options.query ?? queryWhois)(d, { signal: options.signal });
    const registeredAt = parseJprsRegisteredAt(text);
    if (registeredAt) outcome = { registeredAt, failure: null, message: null };
    else if (isJprsNotFound(text)) outcome = { registeredAt: null, failure: "not-found", message: "JPRS の WHOIS に登録がありませんでした" };
    else outcome = { registeredAt: null, failure: "not-found", message: "JPRS の WHOIS に登録日の記載がありませんでした" };
  } catch {
    outcome = { registeredAt: null, failure: "network", message: "JPRS の WHOIS に接続できませんでした" };
  }
  if (outcome.failure !== "network") cache.set(d, outcome);
  return outcome;
}
