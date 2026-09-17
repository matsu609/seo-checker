/**
 * お客様のサイトに貼ってもらう 1 行。純粋関数。
 * `<script async>` なので、ページの表示を待たせない。
 */
import { PUBLIC_APP_ORIGIN } from "@/lib/site";

export function trackingSnippet(siteKey: string, origin: string = PUBLIC_APP_ORIGIN): string {
  return `<script async src="${origin}/t.js" data-site="${siteKey}"></script>`;
}
