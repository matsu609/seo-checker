/**
 * POST /api/aio-topics/coverage — 自社ページが各トピックを書けているかを判定する。
 *
 * ページ取得はユーザー入力の URL なので必ず assertPublicHost + fetchText を通す。
 * 判定は claude-haiku-4-5（構造化出力）。同じページ + 同じトピックなら 6 時間キャッシュ。
 */
import * as cheerio from "cheerio";
import { NextRequest } from "next/server";
import { z } from "zod";
import { judgeCoverage, MAX_PAGE_TEXT, TOPIC_MODEL, type CoverageJudgement } from "@/lib/aio-topics/extract";
import { assertHtmlPage } from "@/lib/analyzer";
import { extractContent } from "@/lib/analyzer/content";
import { assertPublicHost, FetchError, fetchText, normalizeUrl } from "@/lib/analyzer/fetch";
import { requireAuth } from "@/lib/auth/guard";
import { globalCache } from "@/lib/cache";
import { isAnthropicEnabled, toApiError } from "@/lib/llm/anthropic";

export const runtime = "nodejs";
export const maxDuration = 120;

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_JUDGED_TOPICS = 20;

const cache = globalCache<CoverageJudgement[]>("aioTopicsCoverage", CACHE_TTL_MS, 60);

const BodySchema = z.object({
  keyword: z.string().min(1).max(200),
  pageUrl: z.string().min(1).max(2000),
  topics: z.array(z.string().min(1).max(80)).min(1).max(MAX_JUDGED_TOPICS),
});

async function cacheKey(pageUrl: string, topics: readonly string[]): Promise<string> {
  const bytes = new TextEncoder().encode(`${pageUrl}\n${topics.join("\n")}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: NextRequest) {
  // ハンドラ内でも検証する（proxy.ts のマッチャ変更でカバーが外れても止める）
  const denied = await requireAuth();
  if (denied) return denied;
  if (!isAnthropicEnabled()) {
    return Response.json(
      { error: "カバー判定には ANTHROPIC_API_KEY の設定が必要です" },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "リクエスト形式が不正です" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: `対象ページの URL と 1〜${MAX_JUDGED_TOPICS} 件のトピックを指定してください` },
      { status: 422 },
    );
  }
  const { keyword, pageUrl, topics } = parsed.data;

  const key = await cacheKey(pageUrl, topics);
  const cached = cache.get(key);
  if (cached) {
    return Response.json({ pageUrl, judgements: cached, model: TOPIC_MODEL, cached: true });
  }

  let pageText: string;
  let finalUrl: string;
  try {
    const url = normalizeUrl(pageUrl);
    await assertPublicHost(url);
    const page = await fetchText(url.toString());
    assertHtmlPage(page);
    finalUrl = page.finalUrl;
    const $ = cheerio.load(page.body);
    const content = extractContent(page.body, page.finalUrl, $);
    const headings = $("h1, h2, h3")
      .map((_, el) => $(el).text().replace(/\s+/g, " ").trim())
      .get()
      .filter(Boolean)
      .slice(0, 60);
    pageText = [
      headings.length > 0 ? `見出し:\n${headings.map((h) => `- ${h}`).join("\n")}` : "",
      `本文:\n${content.mainText}`,
    ]
      .filter(Boolean)
      .join("\n\n")
      .slice(0, MAX_PAGE_TEXT);
  } catch (err) {
    if (err instanceof FetchError) {
      const status = err.code === "invalid_url" || err.code === "blocked_host" ? 400 : 502;
      return Response.json({ error: err.message }, { status });
    }
    console.error("[aio-topics] page fetch error", err);
    return Response.json({ error: "対象ページを取得できませんでした" }, { status: 502 });
  }

  if (pageText.trim().length < 100) {
    return Response.json(
      { error: "対象ページの本文が短すぎるため判定できません" },
      { status: 422 },
    );
  }

  try {
    const judgements = await judgeCoverage({
      keyword,
      pageUrl: finalUrl,
      pageText,
      topics,
      signal: request.signal,
    });
    cache.set(key, judgements);
    return Response.json({ pageUrl: finalUrl, judgements, model: TOPIC_MODEL, cached: false });
  } catch (err) {
    const info = toApiError(err);
    return Response.json({ error: info.message }, { status: info.status });
  }
}
