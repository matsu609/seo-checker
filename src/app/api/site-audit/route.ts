import { NextRequest } from "next/server";
import { FetchError } from "@/lib/analyzer/fetch";
import { publicUrlError, urlCacheKey } from "@/lib/analyzer/fetch-response";
import { runAudit } from "@/lib/audit/run";
import type { AuditResult, AuditStreamEvent } from "@/lib/audit/types";
import { requireAuth } from "@/lib/auth/guard";
import { globalCache } from "@/lib/cache";
import { resolveMaxPages } from "@/lib/crawl/crawler";
import { acquireCrawlSlot, crawlClientKey } from "@/lib/crawl/gate";
import { ndjsonResponse, ndjsonSingle } from "@/lib/crawl/stream";

export const runtime = "nodejs";
// サイト全体をクロールしたうえで、リンク切れの検証と取得時間の実測を追加で行う
export const maxDuration = 300;

// 1 件で数百 KB になるので保持数は少なくする（/api/site と同じ考え方）
const cache = globalCache<AuditResult>("site-audit", 10 * 60 * 1000, 10);

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
 *
 * 同時実行の上限は crawl/gate.ts の "audit" の枠（精密診断の収集と合計で数える）。
 * 1 回の POST が対象サイトへ最大で maxPages + 100 回程度のリクエストを出すため。
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

  const invalid = await publicUrlError(url);
  if (invalid) return invalid;

  const pages = resolveMaxPages(typeof maxPages === "number" ? maxPages : undefined);
  const key = `${urlCacheKey(url)}|${pages}`;
  if (refresh !== true) {
    const cached = cache.get(key);
    if (cached) return ndjsonSingle({ type: "result", result: cached, cached: true } satisfies AuditStreamEvent);
  }

  const release = acquireCrawlSlot("audit", crawlClientKey(request.headers));
  if (!release) {
    return Response.json(
      { error: "サイト診断が混み合っています。しばらく待ってからお試しください", code: "busy" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  const abort = new AbortController();
  const onClientAbort = () => abort.abort();
  request.signal?.addEventListener("abort", onClientAbort, { once: true });

  return ndjsonResponse<AuditStreamEvent>(
    async (sink) => {
      try {
        const result = await runAudit(url, {
          maxPages: pages,
          signal: abort.signal,
          onProgress: (progress) => sink.send({ type: "progress", ...progress }),
        });
        if (!abort.signal.aborted) {
          cache.set(key, result);
          sink.send({ type: "result", result, cached: false });
        }
      } catch (err) {
        if (err instanceof FetchError) {
          sink.send({ type: "error", error: err.message, code: err.code });
        } else {
          console.error("[site-audit] unexpected error", err);
          sink.send({ type: "error", error: "診断中に予期しないエラーが発生しました" });
        }
      } finally {
        release();
        request.signal?.removeEventListener("abort", onClientAbort);
      }
    },
    {
      onCancel: () => {
        abort.abort();
        release();
      },
    },
  );
}
