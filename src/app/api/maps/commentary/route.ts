/**
 * MEO 診断レポートの AI 総評。
 *
 * GET  … 連携状況だけ返す（画面がボタンの出し分けに使う）
 * POST … { input } を受け取り、Claude に総評（段落の配列）を書かせる。
 *        ANTHROPIC_API_KEY が無ければ 503（画面はルール生成の総評を出し続ける）
 */
import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/guard";
import { globalCache } from "@/lib/cache";
import { isAnthropicEnabled, toApiError } from "@/lib/llm/anthropic";
import { generateMeoCommentary } from "@/lib/maps/commentary";
import { MeoCommentaryInputSchema } from "@/lib/maps/commentary-input";

export const runtime = "nodejs";
export const maxDuration = 120;

const cache = globalCache<string[]>("mapsCommentary", 30 * 60 * 1000, 100);

export async function GET() {
  // ハンドラ内でも検証する（proxy.ts のマッチャ変更でカバーが外れても止める）
  const denied = await requireAuth({ feature: "maps" });
  if (denied) return denied;
  return Response.json({ enabled: isAnthropicEnabled() }, { headers: { "cache-control": "no-store" } });
}

export interface MapsCommentaryResponse {
  paragraphs: string[];
  cached: boolean;
}

export async function POST(request: NextRequest) {
  // ハンドラ内でも検証する（proxy.ts のマッチャ変更でカバーが外れても止める）
  const denied = await requireAuth({ feature: "maps" });
  if (denied) return denied;
  if (!isAnthropicEnabled()) {
    return Response.json(
      { error: "AI 総評には ANTHROPIC_API_KEY の設定が必要です。ルールから生成した総評を表示しています" },
      { status: 503 },
    );
  }

  let body: { input?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "リクエスト形式が不正です" }, { status: 400 });
  }

  // 診断結果はクライアントから届く。プロンプトに載る文字列の長さをここで縛る
  // （縛らないと巨大なプロンプトを作らせて運用側の API キーを消費させられる）
  const parsed = MeoCommentaryInputSchema.safeParse(body.input);
  if (!parsed.success) {
    return Response.json({ error: "診断結果の形式が正しくありません" }, { status: 422 });
  }
  const input = parsed.data;

  const key = `${input.placeId}|${input.score}|${input.ratingCount}|${input.checks.map((c) => c.status[0]).join("")}`;
  const hit = cache.get(key);
  if (hit) {
    const res: MapsCommentaryResponse = { paragraphs: hit, cached: true };
    return Response.json(res, { headers: { "cache-control": "no-store" } });
  }

  try {
    const paragraphs = await generateMeoCommentary(input, { signal: request.signal });
    cache.set(key, paragraphs);
    const res: MapsCommentaryResponse = { paragraphs, cached: false };
    return Response.json(res, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    const { status, message } = toApiError(err);
    return Response.json({ error: message }, { status });
  }
}
