/** ルールを短く書くための小さな道具（ネットワークに出ない純関数） */
import { MAX_DETAIL_ITEMS } from "../config";
import type { AuditCategory, Issue, Severity } from "../types";

export function issue(
  ruleId: string,
  category: AuditCategory,
  severity: Severity,
  url: string,
  detail: string,
  suggestion: string,
): Issue {
  return { ruleId, category, severity, url, detail, suggestion };
}

/** URL の一覧を「a, b, c ほか N 件」に畳む */
export function listUrls(urls: readonly string[], max = MAX_DETAIL_ITEMS): string {
  if (urls.length === 0) return "";
  const shown = urls.slice(0, max);
  const rest = urls.length - shown.length;
  return rest > 0 ? `${shown.join(" / ")} ほか ${rest} 件` : shown.join(" / ");
}

/** URL のパス部分（表示用）。壊れていれば元の文字列 */
export function pathOnly(url: string): string {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}
