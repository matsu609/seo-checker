/**
 * POST /api/faq/propose
 * URL を 1 つ受け取り、いまの FAQ の状態（機械的な事実）と、入れるべき FAQ の提案を返す。
 *
 * `auditOnly: true` のときは AI を呼ばない（実費ゼロ・回数も数えない）。
 * 画面は先に確認だけを走らせ、提案は利用者がボタンを押したときに作る。
 *
 * クイック診断の FAQ 生成（`/api/faq`）とは別物:
 *   - あちらは無料の入口で、ページ本文から想定 FAQ を作るだけ
 *   - こちらは有料ツール。いまの FAQ の状態を確かめ、根拠のない回答を作らせない
 *
 * 回数の上限は 3 重（利用者の指示 2026-09-22「FAQ の生成に上限を設けてください」）:
 *   1. 連打を止める … 同じ人は 1 分に 1 回（NAP チェックと同じ形。Supabase 不要）
 *   2. 1 日の全体上限 … FAQ_PROPOSE_DAILY_LIMIT（既定 200。**Supabase 不要**なので今日から効く）
 *   3. 月の回数上限 … スタンダード 20 / プレミアム 60 回（`usage_events` が要る。#129）
 * キャッシュに当たった分と、AI を呼ばない「確認だけ」（auditOnly）は 1〜3 のどれも消費しない。
 * 「確認だけ」も毎回お客様のページを取りに行くので、1 時間に 30 回の緩い上限だけ置く。
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { FetchError } from "@/lib/analyzer/fetch";
import { NO_STORE } from "@/lib/api/headers";
import { requireAuth } from "@/lib/auth/guard";
import { currentUserId } from "@/lib/auth/user";
import { globalCache } from "@/lib/cache";
import { proposeFaq, type FaqProposalResult } from "@/lib/faq/propose";
import { currentKarteBrief } from "@/lib/karte/server";
import { briefFingerprint } from "@/lib/karte/summary";
import {
  envInt,
  FAQ_AUDIT_PER_HOUR,
  FAQ_PROPOSE_DAILY_DEFAULT,
  FAQ_PROPOSE_DAILY_MESSAGE,
  takeClientToken,
  takeDailyToken,
} from "@/lib/free/ratelimit";
import { isAnthropicEnabled, toApiError } from "@/lib/llm/anthropic";
import { takeUsage } from "@/lib/usage/gate";

export const runtime = "nodejs";
// ページ取得 + AI 生成。HP 改修提案と同じだけ見る
export const maxDuration = 300;

const FEATURE_ID = "faq";
const CACHE_TTL_MS = 30 * 60 * 1000;
/** 同じページを続けて押されたときに実費を二重に払わないためのもの */
const cache = globalCache<FaqProposalResult>("faq-propose", CACHE_TTL_MS, 50);

/** 連打を止める間隔（同じ利用者）。NAP チェックと同じ考え方 */
const COOLDOWN_MS = 60_000;
const cooldown = globalCache<number>("faq-propose-cooldown", COOLDOWN_MS, 1000);

const BodySchema = z.object({
  url: z.string().min(1, "URL を入力してください").max(2000),
  keyword: z.string().max(200).optional(),
  /** 確認だけ（AI を呼ばない） */
  auditOnly: z.boolean().optional(),
  refresh: z.boolean().optional(),
});

export async function POST(request: NextRequest) {
  // ハンドラ内でも検証する（proxy.ts のマッチャ変更でカバーが外れても止める）
  const denied = await requireAuth({ feature: FEATURE_ID });
  if (denied) return denied;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "リクエスト形式が不正です" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "入力が正しくありません" }, { status: 400 });
  }
  const { url, keyword, auditOnly, refresh } = parsed.data;

  if (!auditOnly && !isAnthropicEnabled()) {
    return Response.json(
      { error: "FAQ の提案には ANTHROPIC_API_KEY の設定が必要です。いまの状態の確認だけなら鍵が無くても動きます" },
      { status: 503 },
    );
  }

  try {
    if (auditOnly) {
      // 事実を出すだけ。AI を呼ばないので月の回数は数えない。
      // ただし毎回お客様のページを取りに行くので、押しっぱなしにできないよう緩い上限は置く
      const who = (await currentUserId()) ?? "anonymous";
      if (!takeClientToken("faq-audit", who, FAQ_AUDIT_PER_HOUR)) {
        return Response.json(
          { error: "いまの FAQ の確認は 1 時間に 30 回までです。しばらく待ってからお試しください", code: "rate_limited" },
          { status: 429, headers: NO_STORE },
        );
      }
      const result = await proposeFaq({ url, auditOnly: true, signal: request.signal });
      return Response.json({ result, cached: false });
    }

    // お客様カルテ（強み・よく聞かれる質問）を提案に反映する。未記入なら空文字。
    // **指紋をキーに混ぜる。**混ぜないと、同じ URL を別のお客様が開いたときに
    // 前の人のカルテが入った提案を返してしまう（キャッシュはプロセス内で共有）
    const brief = await currentKarteBrief();
    const key = `${url}|${keyword ?? ""}|${briefFingerprint(brief)}`;
    if (!refresh) {
      const hit = cache.get(key);
      if (hit) return Response.json({ result: hit, cached: true });
    }

    // ここから先は AI を呼ぶ = 実費が出るので、上限を 3 つ通す

    // ① 連打（Supabase が無くても効く）
    const userId = await currentUserId();
    if (userId) {
      const last = cooldown.get(userId);
      if (last && Date.now() - last < COOLDOWN_MS) {
        return Response.json(
          { error: "FAQ の提案は 1 分に 1 回までです。少し待ってからもう一度お試しください", code: "rate_limited" },
          { status: 429, headers: NO_STORE },
        );
      }
      cooldown.set(userId, Date.now());
    }

    // ② 1 日の全体上限（Supabase が無くても効く）
    if (!takeDailyToken("faq-propose", envInt("FAQ_PROPOSE_DAILY_LIMIT", FAQ_PROPOSE_DAILY_DEFAULT))) {
      return Response.json({ error: FAQ_PROPOSE_DAILY_MESSAGE, code: "daily_limit" }, { status: 429, headers: NO_STORE });
    }

    // ③ 月の回数上限（実費の出る呼び出しだけ数える。利用者の決定 2026-09-21。usage_events が要る）
    const over = await takeUsage(FEATURE_ID);
    if (over) return over;

    const result = await proposeFaq({ url, keyword, brief, signal: request.signal });
    cache.set(key, result);
    return Response.json({ result, cached: false });
  } catch (err) {
    if (err instanceof FetchError) {
      return Response.json({ error: err.message }, { status: err.code === "blocked_host" ? 400 : 502 });
    }
    const api = toApiError(err);
    return Response.json({ error: api.message }, { status: api.status });
  }
}
