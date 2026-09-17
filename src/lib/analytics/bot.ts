/**
 * クローラ・監視ツールの UA を弾く。純粋関数。
 * 完全ではない（UA を偽装するものは通る）が、Googlebot や監視サービスで数字が膨らむのを防ぐ。
 */
const BOT_PATTERN = /bot|crawl|spider|slurp|headless|lighthouse|pagespeed|pingdom|uptime|monitor|preview|facebookexternalhit|embedly|quora link|python-requests|curl\/|wget\/|go-http-client|java\/|okhttp|node-fetch|axios\/|phantomjs|selenium|puppeteer|playwright/i;

export function isBotUserAgent(ua: string | null | undefined): boolean {
  if (!ua) return true;
  return BOT_PATTERN.test(ua);
}

/** 端末の種別。UA から mobile / desktop の 2 値だけを取る（機種やブラウザは保存しない） */
export function deviceOf(ua: string | null | undefined): "mobile" | "desktop" {
  if (!ua) return "desktop";
  return /Mobi|Android|iPhone|iPad|iPod|Windows Phone/i.test(ua) ? "mobile" : "desktop";
}
