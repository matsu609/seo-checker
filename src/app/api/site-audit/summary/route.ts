import { NextRequest } from "next/server";
import { AuditSummaryInputSchema, generateAuditSummary } from "@/lib/audit/summary";
import type { AuditSummary } from "@/lib/audit/types";
import { globalCache } from "@/lib/cache";
import { isAnthropicEnabled, toApiError } from "@/lib/llm/anthropic";

export const runtime = "nodejs";
export const maxDuration = 120;

const cache = globalCache<AuditSummary>("site-audit-summary", 30 * 60 * 1000, 50);

/** 連携状況だけを返す（画面がボタンの出し分けに使う） */
export async function GET() {
  return Response.json({ enabled: isAnthropicEnabled() }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * POST { result }
 *
 * サイト診断の集計を渡すと、日本語のサマリー（全体評価 / 技術的な健全性 /
 * コンテンツの問題点 / 優先対応）を生成して返す。ANTHROPIC_API_KEY が
 * 未設定なら 503（画面はルール生成のサマリーをそのまま出し続ける）。
 */
export async function POST(request: NextRequest) {
  if (!isAnthropicEnabled()) {
    return Response.json(
      { error: "AI サマリーには ANTHROPIC_API_KEY の設定が必要です。ルールから生成した要約を表示しています" },
      { status: 503 },
    );
  }

  let body: { result?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "リクエスト形式が不正です" }, { status: 400 });
  }

  // 集計はクライアントから届く。プロンプトに載る配列と文字列の長さをここで縛る
  // （縛らないと巨大なプロンプトを作らせて運用側の API キーを消費させられる）
  const parsed = AuditSummaryInputSchema.safeParse(body.result);
  if (!parsed.success) {
    return Response.json(
      { error: "診断結果の形式が正しくないか、集計の件数が多すぎます" },
      { status: 422 },
    );
  }
  const result = parsed.data;

  const key = `${result.origin}|${result.crawledAt}|${result.issues.length}`;
  const cached = cache.get(key);
  if (cached) return Response.json({ summary: cached, cached: true });

  try {
    const summary = await generateAuditSummary(result, { signal: request.signal });
    cache.set(key, summary);
    return Response.json({ summary, cached: false });
  } catch (err) {
    const { status, message } = toApiError(err);
    return Response.json({ error: message }, { status });
  }
}
