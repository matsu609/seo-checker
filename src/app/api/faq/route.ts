import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { globalCache } from "@/lib/cache";
import { generateFaqs, isFaqEnabled, MAX_INPUT_CHARS } from "@/lib/faq/generate";
import type { FaqItem } from "@/lib/faq/schema";

export const runtime = "nodejs";
export const maxDuration = 60;

/** 同じ URL + 同じ本文なら 1 時間は API を呼ばずに返す */
const cache = globalCache<FaqItem[]>("faq", 60 * 60 * 1000);

export async function GET() {
  return Response.json({ enabled: isFaqEnabled() });
}

export async function POST(request: NextRequest) {
  if (!isFaqEnabled()) {
    return Response.json(
      { error: "FAQ 生成は無効です。サーバーに ANTHROPIC_API_KEY を設定してください" },
      { status: 503 },
    );
  }

  let body: { url?: unknown; title?: unknown; description?: unknown; mainText?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "リクエスト形式が不正です" }, { status: 400 });
  }
  const { url, title, description, mainText } = body;
  if (typeof url !== "string" || typeof mainText !== "string") {
    return Response.json({ error: "url と mainText は必須です" }, { status: 400 });
  }
  if (mainText.trim().length < 100) {
    return Response.json(
      { error: "本文が短すぎるため FAQ を生成できません（100文字以上必要です）" },
      { status: 400 },
    );
  }

  const key = await cacheKey(url, mainText.slice(0, MAX_INPUT_CHARS));
  const cached = cache.get(key);
  if (cached) {
    return Response.json({ faqs: cached, cached: true });
  }

  try {
    const faqs = await generateFaqs({
      url,
      title: typeof title === "string" ? title : null,
      description: typeof description === "string" ? description : null,
      mainText,
    });
    cache.set(key, faqs);
    return Response.json({ faqs, cached: false });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return Response.json({ error: "ANTHROPIC_API_KEY が無効です" }, { status: 503 });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return Response.json(
        { error: "AI の利用上限に達しました。しばらく待って再試行してください" },
        { status: 429 },
      );
    }
    if (err instanceof Anthropic.APIError) {
      console.error("[faq] api error", err.status, err.message);
      return Response.json({ error: "AI との通信に失敗しました" }, { status: 502 });
    }
    console.error("[faq] unexpected error", err);
    return Response.json({ error: "FAQ 生成中にエラーが発生しました" }, { status: 500 });
  }
}

async function cacheKey(url: string, text: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${url}\n${text}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
