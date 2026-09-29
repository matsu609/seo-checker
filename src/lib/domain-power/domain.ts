/**
 * ホスト名から「登録ドメイン」（eTLD+1）を取り出す純関数。
 *
 * RDAP も Open PageRank も `www.example.co.jp` ではなく `example.co.jp` を
 * 相手にするため、その手前で揃える。公開接尾辞リスト（PSL）を丸ごと持つと
 * 数百 KB になるので、**2 文字の国別 TLD + よくある第 2 レベル**だけを
 * 判定する近似にしてある（co.jp / co.uk / com.au など）。
 * 判定を外しても RDAP が 404 を返すだけで、報告書は止まらない。
 */

/** 2 文字の国別 TLD の下で「登録できない」ことが多い第 2 レベル */
const CC_SECOND_LEVELS = new Set([
  "ac", "ad", "art", "asn", "biz", "co", "com", "ed", "edu", "firm", "gen", "go", "gob", "gouv",
  "gov", "gr", "id", "ind", "info", "int", "lg", "ltd", "me", "mil", "ne", "net", "nhs", "nic",
  "nom", "or", "org", "pe", "plc", "re", "res", "sch", "store", "tm", "web",
]);

/**
 * 1 つのドメインを多くの人が分け合う「サイト作成サービス・ブログ・ホスティング」のドメイン
 * （2026-09-23）。`x.jimdofree.com` の登録ドメインを `jimdofree.com` にすると、
 * サービス全体の DR（90 など）をお客様のサイトの数値として出してしまうため、
 * この下のサイトは「サブドメイン 1 つ = 1 サイト」として扱い、外部の評価は取らない。
 * `ameblo.jp` や `note.com` のように URL のパスで人を分けるサービスは、ホストがこのドメイン
 * そのものになる（その場合も評価はサービスのものなので取らない）。
 */
export const SHARED_PLATFORM_DOMAINS: ReadonlySet<string> = new Set([
  // サイト作成サービス
  "jimdofree.com", "jimdosite.com", "jimdo.com", "wixsite.com", "wix.com", "wixstudio.io", "studio.site",
  "weebly.com", "mystrikingly.com", "square.site", "webnode.jp", "crayonsite.net", "crayonsite.info",
  "peraichi.com", "goope.jp", "hp.peraichi.com",
  // ネットショップ
  "base.shop", "thebase.in", "stores.jp", "theshop.jp", "shop-pro.jp", "ocnk.net", "myshopify.com",
  // ブログ
  "hatenablog.com", "hatenablog.jp", "hateblo.jp", "hatenadiary.com", "hatenadiary.jp", "hatenadiary.org",
  "ameblo.jp", "note.com", "fc2.com", "blog.fc2.com", "fc2.net", "livedoor.blog", "blog.jp", "blog.livedoor.jp",
  "seesaa.net", "blog.goo.ne.jp", "blogspot.com", "wordpress.com", "tumblr.com", "substack.com", "medium.com",
  // ホスティング・公開サービス
  "github.io", "gitlab.io", "netlify.app", "vercel.app", "pages.dev", "web.app", "firebaseapp.com",
  "herokuapp.com", "onrender.com", "glitch.me", "azurewebsites.net", "amplifyapp.com", "cloudfront.net",
  "xsrv.jp", "sakura.ne.jp", "lolipop.jp", "wpx.jp", "conoha.io", "coreserver.jp",
]);

/**
 * 都道府県型 JP ドメイン（`example.tokyo.jp`）の第 2 レベル。ここは誰も登録できず、
 * その下の 3 段目が 1 つの登録ドメインになる。
 */
const JP_PREFECTURES = new Set([
  "hokkaido", "aomori", "iwate", "miyagi", "akita", "yamagata", "fukushima", "ibaraki", "tochigi", "gunma",
  "saitama", "chiba", "tokyo", "kanagawa", "niigata", "toyama", "ishikawa", "fukui", "yamanashi", "nagano",
  "gifu", "shizuoka", "aichi", "mie", "shiga", "kyoto", "osaka", "hyogo", "nara", "wakayama", "tottori",
  "shimane", "okayama", "hiroshima", "yamaguchi", "tokushima", "kagawa", "ehime", "kochi", "fukuoka", "saga",
  "nagasaki", "kumamoto", "oita", "miyazaki", "kagoshima", "okinawa",
]);

/** ホストが共有ドメイン（サイト作成サービスなど）の上にあれば、そのドメインを返す。無ければ null */
export function sharedPlatformOf(input: string): string | null {
  const host = hostFrom(input);
  if (!host) return null;
  const labels = host.split(".").filter(Boolean);
  // 長い接尾辞から順に見る（blog.fc2.com を fc2.com より先に当てる）
  for (let i = 0; i < labels.length - 1; i++) {
    const suffix = labels.slice(i).join(".");
    if (SHARED_PLATFORM_DOMAINS.has(suffix)) return suffix;
  }
  return null;
}

/** 先頭の www. を落とし、小文字・末尾ドット無しに揃える */
export function normalizeHost(host: string): string {
  return host
    .trim()
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^www\./, "");
}

/** URL でもホスト名でも受け取って、登録ドメインを返す（判定できなければ空文字） */
export function registrableDomain(input: string): string {
  const host = hostFrom(input);
  if (!host) return "";
  const labels = host.split(".").filter(Boolean);
  // 共有ドメインの上のサイトは、そのすぐ下の 1 段までを 1 サイトとみなす（x.jimdofree.com）
  const platform = sharedPlatformOf(host);
  if (platform) {
    const depth = platform.split(".").length;
    return labels.slice(-Math.min(labels.length, depth + 1)).join(".");
  }
  if (labels.length <= 2) return labels.join(".");
  const tld = labels[labels.length - 1];
  const second = labels[labels.length - 2];
  if (tld.length === 2 && CC_SECOND_LEVELS.has(second)) return labels.slice(-3).join(".");
  // 都道府県型 JP ドメイン（example.tokyo.jp）
  if (tld === "jp" && JP_PREFECTURES.has(second)) return labels.slice(-3).join(".");
  return labels.slice(-2).join(".");
}

/** URL・ホスト名のどちらでもホスト部分だけにする */
export function hostFrom(input: string): string {
  const raw = input.trim();
  if (!raw) return "";
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    return normalizeHost(url.hostname);
  } catch {
    return normalizeHost(raw.split("/")[0]);
  }
}

/** RDAP / Open PageRank に渡してよい形か（パスや記号を混ぜられないようにする） */
export function isQueryableDomain(domain: string): boolean {
  if (!domain || domain.length > 253) return false;
  return /^[a-z0-9¡-￿]([a-z0-9¡-￿-]*[a-z0-9¡-￿])?(\.[a-z0-9¡-￿]([a-z0-9¡-￿-]*[a-z0-9¡-￿])?)+$/i.test(domain);
}

/** 登録日から今日までの年数（小数 1 桁）。日付が読めなければ null */
export function ageYearsFrom(registeredAt: string | null, now = new Date()): number | null {
  if (!registeredAt) return null;
  const t = Date.parse(registeredAt);
  if (!Number.isFinite(t)) return null;
  const years = (now.getTime() - t) / (365.2425 * 24 * 60 * 60 * 1000);
  if (years < 0) return null;
  return Math.round(years * 10) / 10;
}
