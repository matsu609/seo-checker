/**
 * 訪問者の識別子。サーバー専用。
 *
 * IP アドレスと UA をそのまま保存しない代わりに、「日替わりの塩 + サイト + IP + UA」を
 * SHA-256 したものを訪問者 ID にする。同じ人が同じ日に何度来ても同じ ID、翌日には別の ID。
 * 塩は日付から HMAC で作るので、塩そのものを保存する必要が無く、過去の ID を IP に戻すこともできない。
 *
 * 鍵は TRACKING_SECRET（任意）。無ければ Supabase の service_role キーから派生させる
 * （どちらも Vercel の Secret。Supabase を替えると同じ日の訪問者が 2 人に数えられるが、それだけ）。
 */
import { createHash, createHmac } from "node:crypto";

function secret(): string {
  const explicit = process.env.TRACKING_SECRET?.trim();
  if (explicit) return explicit;
  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  return fallback ? `derived:${fallback}` : "development-only";
}

/** 日付（YYYY-MM-DD）ごとの塩 */
export function dailySalt(day: string): string {
  return createHmac("sha256", secret()).update(`tracking-salt:${day}`).digest("hex");
}

export function visitorId(day: string, siteKey: string, ip: string, userAgent: string): string {
  return createHash("sha256").update(`${dailySalt(day)}|${siteKey}|${ip}|${userAgent}`).digest("hex").slice(0, 32);
}

/** 日本時間の日付（YYYY-MM-DD）。日次の集計とタグの「日」はすべてこれで揃える */
export function jstDay(now: Date = new Date()): string {
  const shifted = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}
