/**
 * /api/llmo/run（LLMO モニタリング）
 *
 * 提供を終了した（利用者の決定 2026-09-17: AI の計測を「AI 検索モニタリング」（DataForSEO）に一本化し、
 * OpenAI / Gemini / Perplexity の契約をやめる）。古いクライアントが叩いても実費が出ないよう 410 だけを返す。
 */
export const runtime = "nodejs";

const GONE = { error: "この機能は提供を終了しました。AI 検索モニタリング（/tools/geo）をご利用ください", code: "gone" };

export async function GET() {
  return Response.json(GONE, { status: 410 });
}

export async function POST() {
  return Response.json(GONE, { status: 410 });
}
