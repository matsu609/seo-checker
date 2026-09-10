/**
 * Vercel Cron からの呼び出しの検証。サーバー専用。
 *
 * Vercel は Cron の呼び出しに `Authorization: Bearer <CRON_SECRET>` を付ける。
 * CRON_SECRET が未設定なら常に false（誰でも叩けて外部 API の費用が出る状態にしない）。
 */

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function isCronConfigured(): boolean {
  return (process.env.CRON_SECRET?.trim().length ?? 0) > 0;
}

export function isCronAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  return timingSafeEqual(header, `Bearer ${secret}`);
}
