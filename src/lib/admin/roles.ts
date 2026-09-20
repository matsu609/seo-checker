/**
 * 代理店アカウントと、担当する登録者の結びつき。純粋関数だけを置く。
 *
 * 役割は 3 つある。
 *   マスター … 環境変数 ADMIN_EMAILS に書いたメールアドレス（src/lib/admin/config.ts）。
 *              全登録者が見え、代理店の追加・解除と担当の割り当てができる
 *   代理店   … publicMetadata.role が "agency" のユーザー。自分の担当分だけが見える
 *   登録者   … 上のどちらでもないふつうのお客様。publicMetadata.agencyId に担当代理店を持つ
 *
 * 保存先は Clerk の publicMetadata（plan / featureOverrides / stripe と同じ場所）。
 * ここでもデータベースは持たない。publicMetadata は Backend API からしか書けないので、
 * お客様が自分で代理店に化けたり、担当を付け替えたりはできない
 * （クライアントから書けるのは unsafeMetadata で、こちらは使っていない）。
 *
 * マスターを metadata に持たないのは意図的。運用者の権限だけは、Clerk の値ではなく
 * 環境変数（= Vercel の設定を触れる人だけが変えられるもの）に置いておく。
 */

/** publicMetadata のキー */
export const ROLE_KEY = "role";
export const AGENCY_KEY = "agencyId";

/** role に入りうる値。いまは代理店だけ（マスターは環境変数、登録者は role なし） */
export const AGENCY_ROLE = "agency";

export type AccountRole = "master" | "agency" | "client";

/**
 * Clerk のユーザー ID の形。担当代理店として保存してよい値かをここで絞る。
 * 形の違う文字列を metadata に入れると、あとで「誰の担当か」が追えなくなる。
 */
const USER_ID = /^user_[A-Za-z0-9]+$/;

export function isUserId(value: unknown): value is string {
  return typeof value === "string" && USER_ID.test(value);
}

function record(metadata: unknown): Record<string, unknown> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return {};
  return metadata as Record<string, unknown>;
}

/** publicMetadata が代理店アカウントを表しているか */
export function isAgencyMetadata(metadata: unknown): boolean {
  return record(metadata)[ROLE_KEY] === AGENCY_ROLE;
}

/**
 * publicMetadata から担当代理店のユーザー ID を取り出す。
 * 形が違う値（旧い書き方・手で入れた値）は null にして、担当なしとして扱う。
 */
export function agencyIdFromMetadata(metadata: unknown): string | null {
  const value = record(metadata)[AGENCY_KEY];
  return isUserId(value) ? value : null;
}

/**
 * 代理店かどうかを切り替えた publicMetadata を作る（純粋）。
 *
 * 外すときはキーを消さずに null を入れる。Clerk の updateUserMetadata は
 * 「渡した値で置き換え、null は削除」なので、どちらの解釈でも
 * 「代理店ではない」に落ちる書き方にしておく。
 */
export function withAgencyRole(metadata: unknown, enabled: boolean): Record<string, unknown> {
  return { ...record(metadata), [ROLE_KEY]: enabled ? AGENCY_ROLE : null };
}

/**
 * 担当代理店を差し替えた publicMetadata を作る（純粋）。null で担当なし。
 * 形の違う ID は担当なしとして扱う（呼び出し側の取り違えを metadata に残さない）。
 */
export function withAgencyId(metadata: unknown, agencyId: string | null): Record<string, unknown> {
  return { ...record(metadata), [AGENCY_KEY]: isUserId(agencyId) ? agencyId : null };
}

/**
 * 管理アカウントがその登録者を扱ってよいか（純粋）。
 *
 * 見せる・触れるのは「自分が担当に付いている登録者」だけ。管理アカウント自身
 * （role が agency の相手）は、担当に付いていても扱えないようにする
 * （管理アカウントどうしで割引や機能開放を付け合えると、権限の出どころが追えなくなる）。
 */
export function isAssignedClient(metadata: unknown, agencyId: string): boolean {
  if (!isUserId(agencyId)) return false;
  if (isAgencyMetadata(metadata)) return false;
  return agencyIdFromMetadata(metadata) === agencyId;
}

/**
 * その割り当てを保存してよいか。保存する前に必ず通す。
 *
 * 自分自身を担当代理店にすると、代理店画面に自分が並び、
 * 解除の判断（誰の担当か）も追えなくなるので弾く。
 */
export function canAssignAgency(userId: string, agencyId: string | null): boolean {
  if (agencyId === null) return true;
  if (!isUserId(userId) || !isUserId(agencyId)) return false;
  return userId !== agencyId;
}

/** メールアドレスの正規化（前後の空白を落として小文字に）。メールに見えなければ null */
export function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  // 「@ を含み、前後に 1 文字以上、空白が無い」だけを見る。
  // これ以上の検証は Clerk 側が送信時に行う
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) return null;
  return normalized;
}
