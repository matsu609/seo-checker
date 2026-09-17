/**
 * /api/google/link（Search Console サイト・GA4 プロパティの選択）
 *
 * 提供を終了した（利用者の決定 2026-09-17: Google Search Console / GA4 は使わない）。
 * 古いクライアントが叩いても実費が出ないよう、410 Gone だけを返す。
 * 代わりの機能: アクセス解析（/tools/analytics）
 */
export const runtime = "nodejs";

const GONE = { error: "この機能は提供を終了しました。アクセス解析（/tools/analytics）をご利用ください", code: "gone" };

export async function GET() {
  return Response.json(GONE, { status: 410 });
}

export async function POST() {
  return Response.json(GONE, { status: 410 });
}
