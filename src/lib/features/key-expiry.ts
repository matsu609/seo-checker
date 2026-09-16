/**
 * API キーの有効期限の計算（純関数。クライアントでも読める。キーの値は扱わない）。
 *
 * Ahrefs の APIv3 キーのように**寿命が決まっている**キーがある。切れると
 * その指標が静かに「未取得」になるだけなので、マスター画面に残り日数を出して
 * 先に気づけるようにする。発行日は環境変数（例 `AHREFS_API_KEY_ISSUED_AT`）で
 * 運用者が入れる。**日付は秘密ではない**ので画面に返してよい。
 */

/** 残り日数の区分。soon になったらマスター画面で黄色くする */
export type KeyExpiryLevel = "ok" | "soon" | "expired" | "unknown";

/** この日数を切ったら「そろそろ更新」 */
export const RENEW_SOON_DAYS = 30;

export interface KeyLifetime {
  /** キーの寿命（日）。Ahrefs は 365 */
  days: number;
  /** 発行日（YYYY-MM-DD）を入れる環境変数名 */
  issuedAtEnv: string;
  /** 画面に出す 1 行の説明 */
  note: string;
}

export interface KeyExpiry {
  /** 発行日（YYYY-MM-DD）。未設定は null */
  issuedAt: string | null;
  /** 失効日（YYYY-MM-DD）。発行日が無ければ null */
  expiresAt: string | null;
  /** 残り日数（切れていれば負の数）。発行日が無ければ null */
  daysLeft: number | null;
  level: KeyExpiryLevel;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/** YYYY-MM-DD を UTC の 0 時として読む。形が違えば null */
export function parseIssuedAt(input: string | null | undefined): Date | null {
  const raw = input?.trim();
  if (!raw || !DATE_ONLY.test(raw)) return null;
  const t = Date.parse(`${raw}T00:00:00Z`);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  // 2026-02-31 のような存在しない日付を弾く
  return d.toISOString().slice(0, 10) === raw ? d : null;
}

/** 発行日 + 寿命から失効日と残り日数を出す */
export function keyExpiry(issuedAt: string | null | undefined, lifetime: KeyLifetime, now = new Date()): KeyExpiry {
  const issued = parseIssuedAt(issuedAt);
  if (!issued) return { issuedAt: null, expiresAt: null, daysLeft: null, level: "unknown" };
  const expires = new Date(issued.getTime() + lifetime.days * DAY_MS);
  // 「今日」も UTC の 0 時に丸めて数える（時刻で 1 日ずれないように）
  const today = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  const daysLeft = Math.round((expires.getTime() - today) / DAY_MS);
  return {
    issuedAt: issued.toISOString().slice(0, 10),
    expiresAt: expires.toISOString().slice(0, 10),
    daysLeft,
    level: daysLeft < 0 ? "expired" : daysLeft <= RENEW_SOON_DAYS ? "soon" : "ok",
  };
}

/** 画面に出す短い文言 */
export function expiryLabel(expiry: KeyExpiry): string {
  switch (expiry.level) {
    case "expired":
      return `期限切れ（${expiry.expiresAt}）`;
    case "soon":
      return `あと ${expiry.daysLeft} 日（${expiry.expiresAt} まで）`;
    case "ok":
      return `あと ${expiry.daysLeft} 日（${expiry.expiresAt} まで）`;
    default:
      return "発行日が未設定";
  }
}
