/**
 * サイト全体クロール（sitemap 展開 + 内部リンク BFS）。無料診断と A1 で共有する。
 *
 * サーバー専用（fetch.ts 経由で node:dns を使う）。ブラウザ側で NDJSON を読む
 * ヘルパは `@/lib/crawl/client` を直接 import すること（この barrel は経由しない）。
 */
export * from "./types";
export * from "./url";
export {
  crawlSite,
  resolveMaxPages,
  DEFAULT_MAX_PAGES,
  HARD_MAX_PAGES,
  DEFAULT_TIME_BUDGET_MS,
  DEFAULT_CONCURRENCY,
  PAGE_TIMEOUT_MS,
  type CrawlOptions,
} from "./crawler";
export {
  discoverSitemapUrls,
  FALLBACK_SITEMAP_PATHS,
  MAX_SITEMAP_DEPTH,
  MAX_SITEMAP_FILES,
  MAX_SITEMAP_URLS,
  type DiscoverOptions,
  type SitemapDiscovery,
} from "./discover";
