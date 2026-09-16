/**
 * 「設定に登録したホームページ」を各ツールで使い回すための純関数。
 *
 * 利用者の指示（2026-09-16）: ホームページの URL は設定で 1 回だけ登録し、
 * ほかのタブでは URL の入力を求めない。競合の URL だけは入力欄を残す。
 *
 * 画面側は src/components/site/RegisteredSite.tsx のフック・表示部品から使う。
 * ここは I/O を持たない（localStorage も React も触らない）ので単体で試せる。
 */

/** スキームが付いているか（http / https 以外も拾う） */
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * 入力をトップページの URL に正規化する。
 *
 *   "example.co.jp"            → "https://example.co.jp/"
 *   "http://example.co.jp/a/b" → "http://example.co.jp/"
 *   "  "                       → ""
 *
 * ホスト以外（パス・クエリ）は落とす。ここが各ツールの「対象サイト」になるので、
 * 下層ページを登録されてもサイト全体を指すようにする。
 */
export function toSiteUrl(input: string): string {
  const raw = input.trim();
  if (!raw) return "";
  try {
    const u = new URL(HAS_SCHEME.test(raw) ? raw : `https://${raw}`);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    if (!u.hostname.includes(".")) return "";
    return `${u.protocol}//${u.host}/`;
  } catch {
    return "";
  }
}

/** 登録できる URL か（設定画面の入力チェック） */
export function isValidSiteUrl(input: string): boolean {
  return toSiteUrl(input) !== "";
}

/**
 * 登録サイトを起点に、入力を絶対 URL にする。
 *
 *   ("https://example.co.jp/", "")             → "https://example.co.jp/"
 *   ("https://example.co.jp/", "/service/")    → "https://example.co.jp/service/"
 *   ("https://example.co.jp/", "service")      → "https://example.co.jp/service"
 *   ("https://example.co.jp/", "https://x.jp/")→ "https://x.jp/"
 *   ("", "")                                   → null
 *
 * 入力が空ならトップページ。サイト未登録で入力も無ければ null（呼び出し側で
 * 「設定でホームページを登録してください」を出す）。
 */
export function resolvePageUrl(siteUrl: string, input: string): string | null {
  const site = toSiteUrl(siteUrl);
  const raw = input.trim();

  if (!raw) return site || null;

  if (HAS_SCHEME.test(raw)) {
    try {
      const u = new URL(raw);
      return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
    } catch {
      return null;
    }
  }

  // 「example.co.jp/page」のように、別サイトのホストを貼られた場合
  const firstSegment = raw.split("/")[0];
  if (!raw.startsWith("/") && firstSegment.includes(".") && !firstSegment.includes(" ")) {
    try {
      return new URL(`https://${raw}`).toString();
    } catch {
      return null;
    }
  }

  if (!site) return null;
  try {
    return new URL(raw.startsWith("/") ? raw : `/${raw}`, site).toString();
  } catch {
    return null;
  }
}

/** 登録サイトの中のページか（別サイトを指していたら false） */
export function isSameSite(siteUrl: string, pageUrl: string): boolean {
  const site = toSiteUrl(siteUrl);
  if (!site) return false;
  try {
    return new URL(site).host === new URL(pageUrl).host;
  } catch {
    return false;
  }
}

/** 画面に出す短い形（スキームと末尾の / を落とす） */
export function displayUrl(url: string): string {
  return url.trim().replace(HAS_SCHEME, "").replace(/\/$/, "");
}

/**
 * 登録サイトからの相対表示（ページ指定欄のプレビュー用）。
 * 同じサイトなら "/service/"、別サイトならホスト付きで返す。
 */
export function pageLabel(siteUrl: string, pageUrl: string): string {
  if (!pageUrl) return "";
  if (isSameSite(siteUrl, pageUrl)) {
    try {
      const u = new URL(pageUrl);
      return `${u.pathname}${u.search}`;
    } catch {
      return pageUrl;
    }
  }
  return displayUrl(pageUrl);
}
