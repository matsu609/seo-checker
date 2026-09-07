/**
 * POST /api/aio-topics — 1 キーワード分の AI Overviews 本文を取得し、トピックを抽出する。
 *
 * SERP は 1 回だけ呼び、本文・引用元・自社引用の有無を返す。
 * 履歴（日次の出現）はブラウザ側の aioTopicDays ストアが積み上げる。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { extractTopics, MAX_AIO_TEXT, TOPIC_MODEL, type ExtractedTopic } from "@/lib/aio-topics/extract";
import type { AioTopicsResponse } from "@/lib/aio-topics/types";
import { globalCache } from "@/lib/cache";
import { isAnthropicEnabled, toApiError } from "@/lib/llm/anthropic";
import { measureAioOverview } from "@/lib/rank/measure";
import { dateKey } from "@/lib/rank/classify";
import { getSerpProvider } from "@/lib/serp";
import { SerpError } from "@/lib/serp/serpapi";
import type { SerpResult } from "@/lib/serp/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const SERP_TTL_MS = 10 * 60 * 1000;
const TOPICS_TTL_MS = 6 * 60 * 60 * 1000;

const serpCache = globalCache<SerpResult>("aioTopicsSerp", SERP_TTL_MS, 30);
const topicsCache = globalCache<ExtractedTopic[]>("aioTopicsExtract", TOPICS_TTL_MS, 100);

const BodySchema = z.object({
  keyword: z.string().min(1).max(200),
  device: z.enum(["desktop", "mobile"]).optional(),
  location: z.string().max(120).optional(),
  /** 自社ドメイン（AIO に引用されているかの判定に使う） */
  projectDomain: z.string().max(255).optional(),
});

function hashKey(parts: string[]): string {
  const source = parts.join("\u0000");
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < source.length; i += 1) {
    const c = source.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 + c, 2654435761) >>> 0;
  }
  return `${h1.toString(16)}${h2.toString(16)}`;
}

export async function POST(request: NextRequest) {
  const provider = getSerpProvider();
  const missing: string[] = [];
  if (!provider) missing.push("SERPAPI_KEY");
  if (!isAnthropicEnabled()) missing.push("ANTHROPIC_API_KEY");
  if (!provider || missing.length > 0) {
    return Response.json(
      {
        error: `AIO 頻出トピックの分析には ${missing.join(" と ")} の設定が必要です。サーバーの .env.local に追加してください`,
      },
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
    return Response.json({ error: "キーワードを入力してください（200 文字以内）" }, { status: 422 });
  }
  const keyword = parsed.data.keyword.trim();
  if (!keyword) {
    return Response.json({ error: "キーワードを入力してください" }, { status: 422 });
  }
  const device = parsed.data.device ?? "desktop";
  const location = parsed.data.location?.trim();
  const projectDomain = parsed.data.projectDomain?.trim() ?? "";

  let serp: SerpResult;
  const serpKey = `${device}|${location ?? ""}|${keyword}`;
  try {
    const cached = serpCache.get(serpKey);
    if (cached) {
      serp = cached;
    } else {
      serp = { ...(await provider.search({ q: keyword, device, ...(location ? { location } : {}) })), raw: null };
      serpCache.set(serpKey, serp);
    }
  } catch (err) {
    if (err instanceof SerpError) {
      const status = err.code === "auth" ? 503 : err.code === "rate_limit" ? 429 : 502;
      return Response.json({ error: err.message }, { status });
    }
    console.error("[aio-topics] serp error", err);
    return Response.json({ error: "検索結果の取得に失敗しました" }, { status: 502 });
  }

  const aio = measureAioOverview(serp, { projectDomain, includeAioText: true });
  const takenOn = dateKey();
  const base: AioTopicsResponse = {
    keyword,
    device,
    takenOn,
    aioPresent: aio.present,
    selfCited: aio.selfCited,
    references: aio.references,
    text: aio.text ?? null,
    topics: [],
    model: TOPIC_MODEL,
    fetchedAt: serp.fetchedAt,
  };

  if (!aio.present || !aio.text) {
    return Response.json(base);
  }

  const topicsKey = hashKey([keyword, aio.text.slice(0, MAX_AIO_TEXT)]);
  const cachedTopics = topicsCache.get(topicsKey);
  if (cachedTopics) {
    return Response.json({ ...base, topics: cachedTopics });
  }

  try {
    const topics = await extractTopics({ keyword, text: aio.text, signal: request.signal });
    topicsCache.set(topicsKey, topics);
    return Response.json({ ...base, topics });
  } catch (err) {
    const info = toApiError(err);
    return Response.json({ error: info.message }, { status: info.status });
  }
}
