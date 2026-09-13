/**
 * クイック診断（ログイン不要）の深さの上限。純粋な関数だけを置く。
 *
 * サイト全体の診断は、以前は有料と同じ最大 300 ページまで回していた。無料でそこまで
 * 出すと精密診断（有料）に進む理由が無くなり、こちらのサーバー費も出ていくので、
 * 代表 10 ページで打ち切る（利用者の決定 2026-09-13）。1 ページ診断は入口なので絞らない。
 *
 * 上限はサーバー側（/api/site）で必ずかけ直す。API はログイン不要で叩けるため、
 * 画面が送ってくる maxPages を信用しない。
 */

/** クイック診断でクロールするページ数の上限 */
export const FREE_SITE_MAX_PAGES = 10;
/** 環境変数で変えるときの上限（これ以上は受け付けない） */
const HARD_LIMIT = 50;

/**
 * クイック診断のページ数上限。FREE_SITE_MAX_PAGES 環境変数があればそれを使う
 * （1〜50 の範囲に丸める。壊れた値なら既定）。
 */
export function freeSiteMaxPages(raw = process.env.FREE_SITE_MAX_PAGES): number {
  const n = Number.parseInt((raw ?? "").trim(), 10);
  if (!Number.isFinite(n) || n <= 0) return FREE_SITE_MAX_PAGES;
  return Math.min(n, HARD_LIMIT);
}

/** truncationNote が見るクロール統計（SiteCrawlStats の一部） */
export interface CrawlCounts {
  /** 見つかった一意な URL 数（取得しなかったものも含む） */
  discovered: number;
  /** 採点したページ数 */
  analyzed: number;
  /** どの上限で打ち切ったか（打ち切っていなければ null） */
  truncated?: { reason: string } | null;
}

/**
 * 「見つかった N ページのうち代表の M ページを診断しました」の一言。
 * ページ数の上限で打ち切ったとき（= 残りがあるとき）だけ出す。
 */
export function truncationNote(crawl: CrawlCounts | null | undefined): string | null {
  if (!crawl) return null;
  const rest = crawl.discovered - crawl.analyzed;
  if (rest <= 0) return null;
  if (crawl.truncated && crawl.truncated.reason !== "max-pages") return null;
  const n = (v: number) => v.toLocaleString("ja-JP");
  return `見つかった ${n(crawl.discovered)} ページのうち、代表の ${n(crawl.analyzed)} ページを診断しました。残り ${n(rest)} ページは精密診断で 1 ページずつ採点できます。`;
}
