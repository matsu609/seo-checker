import { NextRequest } from "next/server";
import { FetchError, type SiteAnalysisResult } from "@/lib/analyzer";
import { publicUrlError, urlCacheKey } from "@/lib/analyzer/fetch-response";
import { analyzeSite } from "@/lib/analyzer/site";
import { globalCache } from "@/lib/cache";
import { resolveMaxPages } from "@/lib/crawl/crawler";
import { acquireCrawlSlot, crawlClientKey } from "@/lib/crawl/gate";
import { ndjsonResponse, ndjsonSingle } from "@/lib/crawl/stream";
import { freeSiteMaxPages } from "@/lib/free/limits";
import { requireFreeAccess } from "@/lib/free/access";
import { checkFreeRun, recordFreeRun } from "@/lib/free/monthly";
import { clientKeyOf } from "@/lib/free/ratelimit";
import type { SiteStreamEvent } from "@/lib/crawl/types";

export const runtime = "nodejs";
// サイト全体をクロールするため、1 ページ診断より長くかかる（クロールの時間予算は 240 秒）
export const maxDuration = 300;

// 1 件あたりが大きいので保持数は少なくする（クイック診断は 10 ページまで）
const cache = globalCache<SiteAnalysisResult>("site", 10 * 60 * 1000, 10);

/**
 * POST { url, maxPages? }
 *
 * NDJSON（1 行 1 JSON）でストリーミングする:
 *   { type: "progress", phase, fetched, queued, discovered, analyzed, failed, url?, elapsedMs }
 *   … 1 ページごと …
 *   { type: "result", result, cached: false }   または   { type: "error", error, code? }
 * キャッシュ済みなら { type: "result", result, cached: true } の 1 行だけ返す。
 *
 * 入力の不備（URL 形式・内部ネットワーク）はストリームを始める前に 400 で返す。
 * ストリーム開始後はステータスを変えられないため、クロール中のエラーは error 行で届く。
 *
 * 同時実行の上限（同時 2 本・同一クライアント 1 本）は crawl/gate.ts の "site" の枠。
 * 1 回の POST が対象サイトへ最大 60（サイトマップ）+ maxPages（クイック診断は 10）回の
 * リクエストを出すため、上限を超えたら 429 で断る。
 */
export async function POST(request: NextRequest) {
  // 無料診断は専用リンク（/free/<トークン>）の Cookie が要る（利用者の決定 2026-10-02）
  const signedOut = await requireFreeAccess();
  if (signedOut) return signedOut;

  let body: { url?: unknown; maxPages?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "リクエスト形式が不正です" }, { status: 400 });
  }
  const { url, maxPages } = body;
  if (typeof url !== "string" || !url.trim()) {
    return Response.json({ error: "URLを入力してください" }, { status: 400 });
  }
  if (maxPages !== undefined && maxPages !== null && typeof maxPages !== "number") {
    return Response.json({ error: "maxPages は数値で指定してください" }, { status: 400 });
  }

  // ストリームを始める前に、入力自体の問題は通常のエラー応答で返す
  const invalid = await publicUrlError(url);
  if (invalid) return invalid;

  // この API はログイン不要（クイック診断）なので、画面が送ってきた maxPages を信用せず
  // サーバー側で必ず上限をかけ直す。全ページの採点は精密診断（/tools/seo-analysis）の役目
  const requested = typeof maxPages === "number" ? Math.min(maxPages, freeSiteMaxPages()) : freeSiteMaxPages();
  const pages = resolveMaxPages(requested);
  const key = `${urlCacheKey(url)}|${pages}`;
  const cached = cache.get(key);
  // キャッシュ命中は費用が出ない
  if (cached) return ndjsonSingle({ type: "result", result: cached, cached: true } satisfies SiteStreamEvent);

  // 実行中のクロールが多すぎるときはストリームを始めずに 429
  const release = acquireCrawlSlot("site", crawlClientKey(request.headers));
  if (!release) {
    return Response.json(
      { error: "サイト全体の診断が混み合っています。しばらく待ってからお試しください", code: "busy" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  // 本当にクロールするときだけ月の上限（全体）を見る。混雑（429）やキャッシュ命中では数えない
  const over = await checkFreeRun();
  if (over) {
    release();
    return over;
  }
  void recordFreeRun("free-site", url, clientKeyOf(request));

  // クライアントが切断したらクロールを止める（request.signal と stream の cancel の両方を見る）
  const abort = new AbortController();
  const onClientAbort = () => abort.abort();
  request.signal?.addEventListener("abort", onClientAbort, { once: true });

  return ndjsonResponse<SiteStreamEvent>(
    async (sink) => {
      try {
        const result = await analyzeSite(url, {
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
          console.error("[site] unexpected error", err);
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
