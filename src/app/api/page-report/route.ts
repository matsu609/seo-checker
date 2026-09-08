import { NextRequest } from "next/server";
import { assertHtmlPage } from "@/lib/analyzer";
import { FetchError, assertPublicHost, fetchText, normalizeUrl } from "@/lib/analyzer/fetch";
import { fetchSiteFiles } from "@/lib/analyzer/robots";
import { requireAuth } from "@/lib/auth/guard";
import { globalCache } from "@/lib/cache";
import { buildPageReport } from "@/lib/page-report/analyze";
import type { PageReport } from "@/lib/page-report/types";
import { fetchPsi, isPagespeedKeyConfigured } from "@/lib/psi/client";

export const runtime = "nodejs";
// PageSpeed Insights は実際に対象ページを計測するため 1 分近くかかることがある
export const maxDuration = 180;

const cache = globalCache<PageReport>("page-report", 10 * 60 * 1000, 50);

/** 連携状況（画面が「表示速度も取得する」の既定値を決めるのに使う） */
export async function GET() {
  // ハンドラ内でも検証する（proxy.ts のマッチャ変更でカバーが外れても止める）
  const denied = await requireAuth();
  if (denied) return denied;
  return Response.json(
    { pagespeedKey: isPagespeedKeyConfigured() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * POST { url, psi?: boolean, strategy?: "mobile" | "desktop", refresh?: boolean }
 *
 * 1 ページの AIO/LLM 最適化レポートを返す。外部連携は一切不要で、
 * PAGESPEED_API_KEY は「あれば PSI の呼び出し上限が緩む」だけ
 * （未設定でも取得を試み、429 のときは理由を添えて他の項目を返す）。
 */
export async function POST(request: NextRequest) {
  // ハンドラ内でも検証する（proxy.ts のマッチャ変更でカバーが外れても止める）
  const denied = await requireAuth();
  if (denied) return denied;
  let body: { url?: unknown; psi?: unknown; strategy?: unknown; refresh?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "リクエスト形式が不正です" }, { status: 400 });
  }

  const { url, psi, strategy, refresh } = body;
  if (typeof url !== "string" || !url.trim()) {
    return Response.json({ error: "診断するページの URL を入力してください" }, { status: 400 });
  }
  if (psi !== undefined && typeof psi !== "boolean") {
    return Response.json({ error: "psi は true / false で指定してください" }, { status: 400 });
  }
  if (strategy !== undefined && strategy !== "mobile" && strategy !== "desktop") {
    return Response.json({ error: "strategy は mobile または desktop を指定してください" }, { status: 422 });
  }

  const withPsi = psi !== false;
  const psiStrategy = strategy === "desktop" ? "desktop" : "mobile";
  const key = `${url.trim().toLowerCase()}|${withPsi ? psiStrategy : "none"}`;
  if (refresh !== true) {
    const cached = cache.get(key);
    if (cached) return Response.json({ report: cached, cached: true });
  }

  try {
    const target = normalizeUrl(url);
    await assertPublicHost(target);

    const page = await fetchText(target.toString());
    assertHtmlPage(page);

    const origin = new URL(page.finalUrl).origin;
    // robots.txt / llms.txt と PSI は独立しているので同時に取りに行く
    const [siteFiles, psiOutcome] = await Promise.all([
      fetchSiteFiles(origin),
      withPsi
        ? fetchPsi(page.finalUrl, psiStrategy, { refresh: refresh === true })
        : Promise.resolve({ result: null, error: null, cached: false }),
    ]);

    const report = buildPageReport(page, siteFiles, {
      requestedUrl: target.toString(),
      psi: psiOutcome.result,
      psiError: psiOutcome.error,
    });

    cache.set(key, report);
    return Response.json({ report, cached: false });
  } catch (err) {
    if (err instanceof FetchError) {
      const status = err.code === "invalid_url" || err.code === "blocked_host" ? 400 : 502;
      return Response.json({ error: err.message, code: err.code }, { status });
    }
    console.error("[page-report] unexpected error", err);
    return Response.json({ error: "レポートの生成中にエラーが発生しました" }, { status: 500 });
  }
}
