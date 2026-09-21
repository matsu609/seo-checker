/**
 * 管理アカウント（旧称: 代理店アカウント）の役割まわり。純粋関数だけを置く。
 *
 * 役割は 3 つある。
 *   マスター       … 環境変数 ADMIN_EMAILS に書いたメールアドレス（src/lib/admin/config.ts）。
 *                    全登録者が見え、管理アカウントの追加・解除ができる。システム側（/admin）も見える
 *   管理アカウント … publicMetadata.role が "agency" のユーザー。全登録者が見え、ツールも全部使えるが、
 *                    システム側（/admin）は見えない（利用者の指示 2026-09-21。担当の割り当ては廃止）
 *   登録者         … 上のどちらでもないふつうのお客様
 *
 * 保存先は Clerk の publicMetadata（plan / featureOverrides / stripe と同じ場所）。
 * ここでもデータベースは持たない。publicMetadata は Backend API からしか書けないので、
 * お客様が自分で管理アカウントに化けることはできない
 * （クライアントから書けるのは unsafeMetadata で、こちらは使っていない）。
 *
 * マスターを metadata に持たないのは意図的。運用者の権限だけは、Clerk の値ではなく
 * 環境変数（= Vercel の設定を触れる人だけが変えられるもの）に置いておく。
 */

/** publicMetadata のキー */
export const ROLE_KEY = "role";

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
 * 管理アカウントがその登録者を扱ってよいか（純粋）。
 *
 * **2026-09-21 から、担当かどうかは見ない**（利用者の指示「担当とか関係ない。管理アカウントから
 * 全ユーザーが見れるように」）。管理アカウントは全登録者を見て、対応できる。
 *
 * 唯一の例外は**相手も管理アカウント（role が agency）のとき**。管理アカウントどうしで
 * 割引や機能開放を付け合えると、権限の出どころが追えなくなるので触らせない
 * （運用者のアカウントは代理ログイン側でも別途弾いている）。
 */
export function isManageableClient(metadata: unknown): boolean {
  return !isAgencyMetadata(metadata);
}

/**
 * 保留中の招待の中から「この人あての管理アカウントの招待」を選ぶ（純粋）。
 *
 * 招待リンクを使わずにふつうの登録フォームから登録すると、Clerk は招待の
 * publicMetadata を引き継がない（登録が別物として作られるため）。そこで登録後に
 * 「自分の確認済みメール宛に、role = agency の保留中の招待があるか」を見て拾う。
 *
 * 突き合わせは**確認済みのメールだけ**、かつ**完全一致（大文字小文字は無視）**で行う。
 * 未確認のメールを含めると、他人のアドレスを名乗るだけで管理アカウントになれてしまう。
 */
export function pickAgencyInvitation<T extends { id: string; emailAddress: string; publicMetadata: unknown }>(
  invitations: readonly T[],
  verifiedEmails: readonly string[],
): T | null {
  const mine = new Set(verifiedEmails.map((e) => normalizeEmail(e)).filter((e): e is string => e !== null));
  if (mine.size === 0) return null;
  return (
    invitations.find(
      (inv) => isAgencyMetadata(inv.publicMetadata) && mine.has(normalizeEmail(inv.emailAddress) ?? ""),
    ) ?? null
  );
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
