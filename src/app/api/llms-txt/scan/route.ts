import { NextRequest } from "next/server";
import { FetchError } from "@/lib/analyzer/fetch";
import { globalCache } from "@/lib/cache";
import { HARD_MAX_PAGES } from "@/lib/crawl/crawler";
import { DEFAULT_SCAN_LIMIT, scanSite } from "@/lib/llms-txt/scan";
import type { ScanResult } from "@/lib/llms-txt/types";

export const runtime = "nodejs";
// 最大 300 ページまでクロールできるため、他のクロール系と同じ余裕を取る
export const maxDuration = 300;

const cache = globalCache<ScanResult>("llms-txt-scan", 10 * 60 * 1000, 20);

/**
 * 同時に走らせるクロールの上限（/api/site・/api/site-audit と同じ考え方）。
 * 1 回の POST が対象サイトへ最大でサイトマップ + maxPages（既定 300）回の
 * リクエストを出すため、無制限に受け付けると他所のサイトを叩く踏み台になる。
 */
const MAX_CONCURRENT_CRAWLS = 2;
/** 同じクライアント（IP）が同時に走らせられるクロール数 */
const MAX_CONCURRENT_PER_CLIENT = 1;

interface CrawlGate {
  active: number;
  perClient: Map<string, number>;
}

/** dev のホットリロードで数えが飛ばないよう globalThis に置く */
function crawlGate(): CrawlGate {
  const g = globalThis as unknown as { __seo_checker_llms_scan_gate?: CrawlGate };
  g.__seo_checker_llms_scan_gate ??= { active: 0, perClient: new Map() };
  return g.__seo_checker_llms_scan_gate;
}

/** クライアントの識別子（プロキシ経由の元 IP → 直接接続の IP → 不明） */
function clientKey(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  return first || request.headers.get("x-real-ip") || "unknown";
}

/** 空きがあれば確保して解放関数を返す。空きが無ければ null */
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

/**
 * POST { url, includePaths?, excludePaths?, limit? }
 *
 * llms.txt に載せる候補ページを集める。外部連携は不要。
 * 入力の不備は 400、取得できないサイトは 502 で返す。
 */
export async function POST(request: NextRequest) {
  let body: { url?: unknown; includePaths?: unknown; excludePaths?: unknown; limit?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "リクエスト形式が不正です" }, { status: 400 });
  }

  const { url, includePaths, excludePaths, limit } = body;
  if (typeof url !== "string" || !url.trim()) {
    return Response.json({ error: "サイトの URL を入力してください" }, { status: 400 });
  }
  if (includePaths !== undefined && typeof includePaths !== "string") {
    return Response.json({ error: "対象パスは文字列で指定してください" }, { status: 422 });
  }
  if (excludePaths !== undefined && typeof excludePaths !== "string") {
    return Response.json({ error: "除外パスは文字列で指定してください" }, { status: 422 });
  }
  if (limit !== undefined && (typeof limit !== "number" || !Number.isFinite(limit) || limit < 1)) {
    return Response.json({ error: "上限ページ数は 1 以上の数値で指定してください" }, { status: 422 });
  }
  // 黙って丸めず、上限を超える指定は断る（運用側の上限は resolveMaxPages がさらに絞る）
  if (typeof limit === "number" && limit > HARD_MAX_PAGES) {
    return Response.json(
      { error: `上限ページ数は ${HARD_MAX_PAGES} 以下で指定してください` },
      { status: 422 },
    );
  }

  const key = [url.trim().toLowerCase(), includePaths ?? "", excludePaths ?? "", limit ?? DEFAULT_SCAN_LIMIT].join("|");
  const cached = cache.get(key);
  if (cached) return Response.json({ scan: cached, cached: true });

  const release = acquireCrawlSlot(clientKey(request));
  if (!release) {
    return Response.json(
      { error: "ページの収集が混み合っています。しばらく待ってからお試しください", code: "busy" },
      { status: 429, headers: { "Retry-After": "60" } },
    );
  }

  try {
    const scan = await scanSite(url, {
      includePaths: typeof includePaths === "string" ? includePaths : undefined,
      excludePaths: typeof excludePaths === "string" ? excludePaths : undefined,
      limit: typeof limit === "number" ? limit : DEFAULT_SCAN_LIMIT,
      signal: request.signal,
    });
    cache.set(key, scan);
    return Response.json({ scan, cached: false });
  } catch (err) {
    if (err instanceof FetchError) {
      const status = err.code === "invalid_url" || err.code === "blocked_host" ? 400 : 502;
      return Response.json({ error: err.message, code: err.code }, { status });
    }
    console.error("[llms-txt/scan] unexpected error", err);
    return Response.json({ error: "ページの収集中にエラーが発生しました" }, { status: 500 });
  } finally {
    release();
  }
}
