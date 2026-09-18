/**
 * ブラウザ側ストアをサーバー（user_stores）と同期するときの決めごと（純粋。テストで固定する）。
 *
 * - 同期するのは「お客様が登録・実行したもの」。画面の状態（開いている柱・確認中の割引コード）は
 *   その端末だけのものなので同期しない（LOCAL_ONLY）。
 * - サーバーが正。ログインしたユーザーが前回この端末で同期した人と違えば、端末の値は全部捨てて
 *   サーバーの値に置き換える（別のお客様のデータが混ざらないようにする。代理ログインもこの経路）。
 * - この仕組みを入れる前から使っているお客様の端末には、サーバーに無いデータが localStorage にある。
 *   「この端末でまだ誰も同期していない かつ サーバーにそのユーザーのデータが 1 つも無い」ときだけ、
 *   端末の値をサーバーへ上げる（移行）。
 */

/** 同期しないストア名（端末ごとの画面の状態） */
export const LOCAL_ONLY_STORES: readonly string[] = ["sidebarTab", "promoCode"];

/** 前回この端末で同期したユーザー ID を入れる localStorage のキー */
export const OWNER_KEY = "seo-checker:v1:__owner";

const NAME_RE = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;

export function isSyncedStoreName(name: string): boolean {
  return NAME_RE.test(name) && !LOCAL_ONLY_STORES.includes(name);
}

export type HydrationMode =
  /** 端末の値をサーバーへ上げる（初回の移行） */
  | "migrate"
  /** サーバーの値を端末に入れる。サーバーに無いストアは端末の値のまま */
  | "pull"
  /** 端末の値を全部捨ててサーバーの値に置き換える（ユーザーが変わった） */
  | "replace";

export interface HydrationInput {
  /** いまログインしているユーザー */
  userId: string;
  /** 前回この端末で同期したユーザー（無ければ null） */
  previousOwner: string | null;
  /** サーバーにこのユーザーのストアが 1 つでもあるか */
  serverHasAny: boolean;
}

export function hydrationMode({ userId, previousOwner, serverHasAny }: HydrationInput): HydrationMode {
  if (previousOwner === null) return serverHasAny ? "replace" : "migrate";
  if (previousOwner !== userId) return "replace";
  return "pull";
}

/** 値が初期値と同じか（移行のとき、空のストアまで上げない） */
export function isInitialValue(value: unknown, initial: unknown): boolean {
  return JSON.stringify(value) === JSON.stringify(initial);
}
