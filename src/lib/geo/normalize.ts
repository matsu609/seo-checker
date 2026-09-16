/**
 * キーワード・プロンプトの正規化とハッシュ（仕様書 §7.1）。
 *
 * **顧客をまたいで計測結果を使い回す**ための鍵。全角半角・空白・大文字小文字・
 * 句読点の揺れを吸収してから SHA-256 にする。同業の顧客が増えるほど
 * 1 社あたりの原価が下がる、この製品の原価設計の中心。
 *
 * 純関数（Web Crypto を使うので async）。ブラウザでもサーバーでも動く。
 */

/** 全角英数・記号を半角にする（NFKC が大半を担うが、波ダッシュ類は別途） */
const WAVE_DASH = /[〜～]/g;
/** 落とす句読点・記号（意味を変えないもの） */
const PUNCTUATION = /[、。，．,.!！?？「」『』（）()[\]【】《》・:：;；'"”“’‘`|｜/／\\]/g;

/**
 * 表記揺れを吸収した文字列にする。
 * - NFKC で全角英数・カナを揃える
 * - 小文字化
 * - 句読点・記号を除去
 * - 連続する空白（全角含む）を 1 つの半角空白に畳み、前後を落とす
 */
export function normalizeText(input: string): string {
  return input
    .normalize("NFKC")
    .toLowerCase()
    .replace(WAVE_DASH, "~")
    .replace(PUNCTUATION, " ")
    .replace(/[\s　]+/g, " ")
    .trim();
}

/** 正規化してから SHA-256（16 進 64 桁）にする */
export async function normalizedHash(input: string): Promise<string> {
  const normalized = normalizeText(input);
  const bytes = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * キャッシュの鍵。ハッシュ × モデル × ロケールで 1 本（§7.1）。
 * モデルやロケールが違えば別の計測なので混ぜない。
 */
export function cacheKey(hash: string, model: string, locale: string): string {
  return `${hash}|${model}|${locale}`;
}

/** ドメインの正規化。www を落として小文字に（引用元の突き合わせに使う） */
export function normalizeDomain(input: string): string {
  const raw = input.trim().toLowerCase();
  if (!raw) return "";
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(raw) ? raw : `https://${raw}`);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return raw.replace(/^www\./, "").split("/")[0];
  }
}

/**
 * `domain` が `registered`（登録ドメイン）配下か。
 * サブドメインを含めて判定する（§4.3「サブドメイン含む」）。
 */
export function matchesDomain(domain: string, registered: string): boolean {
  const a = normalizeDomain(domain);
  const b = normalizeDomain(registered);
  if (!a || !b) return false;
  return a === b || a.endsWith(`.${b}`);
}
