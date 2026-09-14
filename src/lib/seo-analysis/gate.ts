/**
 * クロールを伴う API の同時実行の制限（/api/site-audit と同じ土台を共有）。
 *
 * 1 回の収集が対象サイトへ数百リクエストを出すため、無制限に受け付けると
 * 他所のサイトを叩く踏み台になる。プロセス内で「同時 2 本まで・同一クライアント
 * 1 本まで」。globalThis のキーをサイト診断と揃え、両方の合計で数える。
 */
const MAX_CONCURRENT_CRAWLS = 2;
const MAX_CONCURRENT_PER_CLIENT = 1;

interface CrawlGate {
  active: number;
  perClient: Map<string, number>;
}

function crawlGate(): CrawlGate {
  const g = globalThis as unknown as { __seo_checker_audit_gate?: CrawlGate };
  g.__seo_checker_audit_gate ??= { active: 0, perClient: new Map() };
  return g.__seo_checker_audit_gate;
}

export function clientKeyOf(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || headers.get("x-real-ip") || "unknown";
}

/** 枠を取る。取れなければ null。取れたら解放関数 */
export function acquireCrawlSlot(client: string): (() => void) | null {
  const gate = crawlGate();
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
