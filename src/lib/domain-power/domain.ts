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
  if (labels.length <= 2) return labels.join(".");
  const tld = labels[labels.length - 1];
  const second = labels[labels.length - 2];
  if (tld.length === 2 && CC_SECOND_LEVELS.has(second)) return labels.slice(-3).join(".");
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
