/**
 * POST /api/faq — クイック診断の「想定 FAQ」。ページ本文から FAQ を下書きする。
 *
 * 回数の上限（利用者の指示 2026-09-22「FAQ の生成に上限を設けてください」）:
 *   1. 登録（ログイン）が要る … requireFreeUser()
 *   2. 1 人 1 時間に 10 回 … FREE_FAQ_PER_HOUR（鍵はログイン中の利用者 ID。取れなければ IP）
 *   3. 全体で 1 日 300 回 … FREE_FAQ_DAILY_LIMIT
 *   4. 1 回に返す件数は MAX_FAQ_ITEMS 件まで
 * **キャッシュに当たった分（Claude を呼ばない分）は数えない。**無料診断の 2 回の枠
 * （consumeFreeRun）はここでは消費しない。診断そのもので消費済みで、FAQ を押すたびに
 * 診断の残り回数が減るのは筋が違うため。
 */
import Anthropic from "@anthropic-ai/sdk";
import { NextRequest } from "next/server";
import { NO_STORE } from "@/lib/api/headers";
import { currentUserId } from "@/lib/auth/user";
import { globalCache } from "@/lib/cache";
import { generateFaqs, isFaqEnabled, MAX_INPUT_CHARS } from "@/lib/faq/generate";
import {
  clientKeyOf,
  envInt,
  FAQ_CLIENT_LIMIT_MESSAGE,
  FAQ_DAILY_LIMIT_MESSAGE,
  FREE_FAQ_DAILY_DEFAULT,
  FREE_FAQ_PER_HOUR,
  takeClientToken,
  takeDailyToken,
} from "@/lib/free/ratelimit";
import { requireFreeUser } from "@/lib/free/quota";
import { MAX_FAQ_ITEMS, type FaqItem } from "@/lib/faq/schema";

export const runtime = "nodejs";
export const maxDuration = 60;

/** 同じ URL + 同じ本文なら 1 時間は API を呼ばずに返す */
const cache = globalCache<FaqItem[]>("faq", 60 * 60 * 1000);

export async function GET() {
  return Response.json({ enabled: isFaqEnabled() });
}

export async function POST(request: NextRequest) {
  // 無料診断の一部（AI の費用が出る）。登録（ログイン）が要る
  const denied = await requireFreeUser();
  if (denied) return denied;
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

  // ここから先は Claude を呼ぶ = 費用が出るので、上限を消費する
  const who = (await currentUserId()) ?? clientKeyOf(request);
  if (!takeClientToken("faq", who, FREE_FAQ_PER_HOUR)) {
    return Response.json({ error: FAQ_CLIENT_LIMIT_MESSAGE, code: "rate_limited" }, { status: 429, headers: NO_STORE });
  }
  if (!takeDailyToken("faq", envInt("FREE_FAQ_DAILY_LIMIT", FREE_FAQ_DAILY_DEFAULT))) {
    return Response.json({ error: FAQ_DAILY_LIMIT_MESSAGE, code: "daily_limit" }, { status: 429, headers: NO_STORE });
  }

  try {
    const faqs = await generateFaqs({
      url,
      title: typeof title === "string" ? title : null,
      description: typeof description === "string" ? description : null,
      mainText,
    });
    cache.set(key, faqs);
    return Response.json({ faqs, cached: false, maxItems: MAX_FAQ_ITEMS });
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
