/**
 * 来店客向けアンケートの URL（純粋関数。クライアントでも読める）。
 */

/** `/r/<slug>?c=<code>`。code が無ければ `/r/<slug>` */
export function surveyPath(slug: string, code?: string | null): string {
  return code ? `/r/${encodeURIComponent(slug)}?c=${encodeURIComponent(code)}` : `/r/${encodeURIComponent(slug)}`;
}

/**
 * リクエストから公開 URL の起点を求める。Vercel ではプロキシ越しなので
 * x-forwarded-host / x-forwarded-proto を優先し、無ければ request.url の origin。
 */
export function originOf(request: Request): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  if (host) return `${proto}://${host.split(",")[0]!.trim()}`;
  return new URL(request.url).origin;
}
