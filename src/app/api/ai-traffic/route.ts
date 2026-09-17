/**
 * /api/ai-traffic（GA4 の生成 AI 流入分析）
 *
 * 提供を終了した（利用者の決定 2026-09-17: Google Search Console / GA4 は使わない。
 * 自前の計測タグもお客様側の作業が要るので取り下げ）。
 * 古いクライアントが叩いても実費が出ないよう、410 Gone だけを返す。
 */
export const runtime = "nodejs";

const GONE = { error: "この機能は提供を終了しました。検索パフォーマンス（推定）（/tools/search-estimate）をご利用ください", code: "gone" };

export async function GET() {
  return Response.json(GONE, { status: 410 });
}

export async function POST() {
  return Response.json(GONE, { status: 410 });
}
