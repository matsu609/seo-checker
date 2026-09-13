/**
 * このアプリが公開されている URL。robots.txt と sitemap.xml が絶対 URL を作るのに使う。
 *
 * NEXT_PUBLIC_APP_ORIGIN が設定されていればそれを使い、無ければ本番の既定値。
 * 紹介サイト（seo-checker.tokyo）とは別で、ここはアプリ本体（app.seo-checker.tokyo）。
 */
const DEFAULT_ORIGIN = "https://app.seo-checker.tokyo";

export const PUBLIC_APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_ORIGIN || DEFAULT_ORIGIN).replace(/\/+$/, "");
