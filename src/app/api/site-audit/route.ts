import { NextRequest } from "next/server";
import { FetchError, assertPublicHost, normalizeUrl } from "@/lib/analyzer/fetch";
import { runAudit } from "@/lib/audit/run";
import type { AuditResult, AuditStreamEvent } from "@/lib/audit/types";
import { requireAuth } from "@/lib/auth/guard";
import { globalCache } from "@/lib/cache";
import { resolveMaxPages } from "@/lib/crawl/crawler";

export const runtime = "nodejs";
// サイト全体をクロールしたうえで、リンク切れの検証と取得時間の実測を追加で行う
export const maxDuration = 300;

// 1 件で数百 KB になるので保持数は少なくする（/api/site と同じ考え方）
const cache = globalCache<AuditResult>("site-audit", 10 * 60 * 1000, 10);

/**
 * 同時に走らせるクロールの上限。
 * 1 回の POST が対象サイトへ最大で maxPages + 100 回程度のリクエストを出すため、
 * 無制限に受け付けると他所のサイトを叩く踏み台になる（/api/site と同じ制限）。
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

function clientKey(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || request.headers.get("x-real-ip") || "unknown";
}

function acquireCrawlSlot(client: string): (() => void) | null {
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

const NDJSON_HEADERS = {
  "Content-Type": "application/x-ndjson; charset=utf-8",
  "Cache-Control": "no-cache, no-store, no-transform",
  "X-Content-Type-Options": "nosniff",
  "X-Accel-Buffering": "no",
} as const;

const encoder = new TextEncoder();

function serializeLine(event: AuditStreamEvent): string {
  return JSON.stringify(event) + "\n";
}

function statusFor(err: FetchError): number {
  return err.code === "invalid_url" || err.code === "blocked_host" ? 400 : 502;
}

/**
 * POST { url, maxPages?, refresh? }
 *
 * NDJSON（1 行 1 JSON）でストリーミングする:
 *   { type: "progress", phase, fetched, queued, discovered, analyzed, failed, url?, elapsedMs }
 *   … 進捗 …
 *   { type: "result", result, cached } または { type: "error", error, code? }
 *
 * 入力の不備（URL 形式・内部ネットワーク）はストリームを始める前に 400 で返す。
 * ストリーム開始後はステータスを変えられないため、途中のエラーは error 行で届く。
 */
export async function POST(request: NextRequest) {
  // ハンドラ内でも検証する（proxy.ts のマッチャ変更でカバーが外れても止める）
  const denied = await requireAuth({ feature: "site-audit" });
  if (denied) return denied;
  let body: { url?: unknown; maxPages?: unknown; refresh?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "リクエスト形式が不正です" }, { status: 400 });
  }

  const { url, maxPages, refresh } = body;
  if (typeof url !== "string" || !url.trim()) {
    return Response.json({ error: "診断するサイトの URL を入力してください" }, { status: 400 });
  }
  if (maxPages !== undefined && maxPages !== null && typeof maxPages !== "number") {
    return Response.json({ error: "maxPages は数値で指定してください" }, { status: 400 });
  }

  try {
    const entry = normalizeUrl(url);
    await assertPublicHost(entry);
  } catch (err) {
    if (err instanceof FetchError) {
      return Response.json({ error: err.message, code: err.code }, { status: statusFor(err) });
    }
    throw err;
  }

  const pages = resolveMaxPages(typeof maxPages === "number" ? maxPages : undefined);
  const key = `${url.trim().toLowerCase()}|${pages}`;
  if (refresh !== true) {
    const cached = cache.get(key);
    if (cached) {
      return new Response(serializeLine({ type: "result", result: cached, cached: true }), {
        headers: NDJSON_HEADERS,
      });
    }
  }

  const release = acquireCrawlSlot(clientKey(request));
  if (!release) {
    return Response.json(
      { error: "サイト診断が混み合っています。しばらく待ってからお試しください", code: "busy" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const abort = new AbortController();
  const onClientAbort = () => abort.abort();
  request.signal?.addEventListener("abort", onClientAbort, { once: true });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: AuditStreamEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(serializeLine(event)));
        } catch {
          closed = true;
        }
      };

      try {
        const result = await runAudit(url, {
          maxPages: pages,
          signal: abort.signal,
          onProgress: (progress) => send({ type: "progress", ...progress }),
        });
        if (!abort.signal.aborted) {
          cache.set(key, result);
          send({ type: "result", result, cached: false });
        }
      } catch (err) {
        if (err instanceof FetchError) {
          send({ type: "error", error: err.message, code: err.code });
        } else {
          console.error("[site-audit] unexpected error", err);
          send({ type: "error", error: "診断中に予期しないエラーが発生しました" });
        }
      } finally {
        release();
        request.signal?.removeEventListener("abort", onClientAbort);
        closed = true;
        try {
          controller.close();
        } catch {
          /* 既に閉じている */
        }
      }
    },
    cancel() {
      abort.abort();
      release();
    },
  });

  return new Response(stream, { headers: NDJSON_HEADERS });
}
