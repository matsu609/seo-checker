/**
 * クロールを伴う API の同時実行の制限（サーバー専用。2026-09-23 に 4 か所の複製をまとめた）。
 *
 * 1 回の呼び出しが対象サイトへ数十〜数百回のリクエストを出すため、無制限に受け付けると
 * 他所のサイトを叩く踏み台になり、メモリも同時実行数だけ積み上がる。プロセス内で
 * 「同時 2 本まで・同一クライアント（x-forwarded-for の先頭 IP）1 本まで」。
 *
 * 枠は名前ごとに別に数える（以前と同じ分け方）:
 *   - "site"      … クイック診断のサイト全体（/api/site）
 *   - "audit"     … サイト診断（/api/site-audit）と精密診断の収集（/api/seo-analysis/collect）の合計
 *   - "llms-scan" … llms.txt の候補集め（/api/llms-txt/scan）
 * dev のホットリロードで数えが飛ばないよう globalThis に置く（キーは以前と同じ）。
 */

export type CrawlGateName = "site" | "audit" | "llms-scan";

/** 名前ごとの globalThis のキー（以前のルートが使っていたものと同じ） */
const GLOBAL_KEYS: Record<CrawlGateName, string> = {
  site: "__seo_checker_site_gate",
  audit: "__seo_checker_audit_gate",
  "llms-scan": "__seo_checker_llms_scan_gate",
};

/** 同時に走らせるクロールの上限 */
export const MAX_CONCURRENT_CRAWLS = 2;
/** 同じクライアントが同時に走らせられるクロール数 */
export const MAX_CONCURRENT_PER_CLIENT = 1;

interface CrawlGate {
  /** 実行中のクロール数 */
  active: number;
  /** クライアントごとの実行中クロール数 */
  perClient: Map<string, number>;
}

function gateOf(name: CrawlGateName): CrawlGate {
  const g = globalThis as unknown as Record<string, CrawlGate | undefined>;
  const key = GLOBAL_KEYS[name];
  g[key] ??= { active: 0, perClient: new Map() };
  return g[key];
}

/** クライアントの識別子（プロキシ経由の元 IP → 直接接続の IP → 不明） */
export function crawlClientKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || headers.get("x-real-ip") || "unknown";
}

/** 空きがあれば確保して解放関数を返す（何度呼んでも 1 回だけ解放する）。空きが無ければ null */
export function acquireCrawlSlot(name: CrawlGateName, client: string): (() => void) | null {
  const gate = gateOf(name);
  if (gate.active >= MAX_CONCURRENT_CRAWLS) return null;
  if ((gate.perClient.get(client) ?? 0) >= MAX_CONCURRENT_PER_CLIENT) return null;
  gate.active += 1;
  gate.perClient.set(client, (gate.perClient.get(client) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    gate.active = Math.max(0, gate.active - 1);
    const left = (gate.perClient.get(client) ?? 1) - 1;
    if (left > 0) gate.perClient.set(client, left);
    else gate.perClient.delete(client);
  };
}
