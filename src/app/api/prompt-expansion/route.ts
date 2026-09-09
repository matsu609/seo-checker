/**
 * POST /api/prompt-expansion — 参考プロンプトと対象サイトから関連プロンプトを生成する（B7）。
 *
 * 対象サイトのトップページは assertPublicHost → fetchText で取得し、
 * タイトル・説明・ナビゲーション・見出しだけを文脈として LLM に渡す。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guard";
import { globalCache } from "@/lib/cache";
import { isAnthropicEnabled, toApiError } from "@/lib/llm/anthropic";
import { expandPrompts } from "@/lib/llmo/expansion/generate";
import { fetchSiteContext } from "@/lib/llmo/expansion/site-context";

import {
  DEFAULT_COUNT,
  MAX_COUNT,
  MAX_SEED_PROMPTS,
  MIN_COUNT,
  type ExpansionResult,
} from "@/lib/llmo/expansion/types";

export const runtime = "nodejs";
export const maxDuration = 180;

const RESULT_TTL_MS = 60 * 60 * 1000;
const resultCache = globalCache<ExpansionResult>("promptExpansion", RESULT_TTL_MS, 30);

const BodySchema = z.object({
  seedPrompts: z.array(z.string().max(300)).min(1).max(MAX_SEED_PROMPTS),
  siteUrl: z.string().min(1).max(2_000),
  count: z.number().int().min(MIN_COUNT).max(MAX_COUNT).optional(),
});

/** キャッシュキー（入力の組み合わせを短いハッシュにする） */
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
  // ハンドラ内でも検証する（proxy.ts のマッチャ変更でカバーが外れても止める）
  const denied = await requireAuth({ feature: "prompt-expansion" });
  if (denied) return denied;
  if (!isAnthropicEnabled()) {
    return Response.json(
      { error: "プロンプト拡張には ANTHROPIC_API_KEY の設定が必要です。サーバーの .env.local に追加してください" },
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
      { error: `参考プロンプト（${MAX_SEED_PROMPTS} 本まで）と対象サイト URL を入力してください` },
      { status: 422 },
    );
  }

  const seedPrompts = parsed.data.seedPrompts.map((p) => p.trim()).filter(Boolean);
  if (seedPrompts.length === 0) {
    return Response.json({ error: "参考プロンプトを 1 本以上入力してください" }, { status: 422 });
  }
  const siteUrl = parsed.data.siteUrl.trim();
  const count = parsed.data.count ?? DEFAULT_COUNT;

  const key = hashKey([siteUrl, String(count), ...seedPrompts]);
  const cached = resultCache.get(key);
  if (cached) return Response.json(cached);

  const { context, error: siteError } = await fetchSiteContext(siteUrl);

  try {
    const result = await expandPrompts({
      seedPrompts,
      siteUrl,
      site: context,
      siteError,
      count,
      signal: request.signal,
    });
    resultCache.set(key, result);
    return Response.json(result);
  } catch (err) {
    const info = toApiError(err);
    return Response.json({ error: info.message }, { status: info.status });
  }
}
