/**
 * 取得した HTML・ヘッダから 1 ページの状態を読む / スナップショットから事故を導く / 前回との差分。純粋関数。
 */
import * as cheerio from "cheerio";
import { canonicalizeUrl, looksLikeHtmlUrl } from "@/lib/crawl/url";
import { INCIDENT_SEVERITY, incidentKey, type Incident, type IncidentKind, type MonitorDiff, type MonitorSnapshot, type PageCheck } from "./types";

/** 主要ページの「遅い」の閾値（サーバー応答 + 本文の取得） */
export const SLOW_MS = 5_000;
/** 証明書の期限が「近い」の閾値（日） */
export const SSL_WARN_DAYS = 14;
/** リンク切れの知らせを出す件数 */
export const BROKEN_LINKS_MIN = 1;

export interface FetchedLike {
  ok: boolean;
  status: number;
  finalUrl: string;
  body: string;
  headers: { get(name: string): string | null };
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** HTML と応答ヘッダ → ページの状態 */
export function pageCheckFromFetched(url: string, home: boolean, fetched: FetchedLike, ms: number | null, robotsAllowed: boolean): PageCheck {
  const $ = cheerio.load(fetched.body || "");
  const metaRobots = [$('meta[name="robots"]').attr("content"), $('meta[name="googlebot"]').attr("content")].filter((v): v is string => typeof v === "string").join(",");
  const xRobots = fetched.headers.get("x-robots-tag") ?? "";
  const noindex = /noindex/i.test(metaRobots) || /noindex/i.test(xRobots);
  const canonical = $('link[rel="canonical"]').attr("href") ?? null;
  let canonicalHost: string | null = null;
  if (canonical) {
    try {
      canonicalHost = hostOf(new URL(canonical, fetched.finalUrl || url).toString());
    } catch {
      canonicalHost = null;
    }
  }
  const title = ($("title").first().text() || "").replace(/\s+/g, " ").trim() || null;
  let jsonLdBlocks = 0;
  let jsonLdErrors = 0;
  $('script[type="application/ld+json"]').each((_, el) => {
    jsonLdBlocks += 1;
    try {
      JSON.parse($(el).text());
    } catch {
      jsonLdErrors += 1;
    }
  });
  return { url, home, finalUrl: fetched.finalUrl || null, status: fetched.status, ms, noindex, robotsAllowed, canonicalHost, title, jsonLdBlocks, jsonLdErrors, error: null };
}

/** 接続できなかったページ */
export function pageCheckFailed(url: string, home: boolean, error: string, robotsAllowed: boolean): PageCheck {
  return { url, home, finalUrl: null, status: null, ms: null, noindex: false, robotsAllowed, canonicalHost: null, title: null, jsonLdBlocks: 0, jsonLdErrors: 0, error };
}

/** トップページの HTML から、同じサイトの内部リンク（HTML らしいものだけ・重複なし・最大 max） */
export function internalLinksFrom(pageUrl: string, html: string, max = 30): string[] {
  const $ = cheerio.load(html || "");
  const host = hostOf(pageUrl);
  const self = canonicalizeUrl(pageUrl);
  const seen = new Set<string>();
  const out: string[] = [];
  $("a[href]").each((_, el) => {
    if (out.length >= max) return false;
    const href = $(el).attr("href");
    if (!href || /^(mailto:|tel:|javascript:|#)/i.test(href)) return;
    const abs = canonicalizeUrl(href, pageUrl);
    if (!abs || abs === self || seen.has(abs)) return;
    if (hostOf(abs) !== host || !looksLikeHtmlUrl(abs)) return;
    seen.add(abs);
    out.push(abs);
  });
  return out;
}

function make(kind: IncidentKind, url: string | null, detail: string): Incident {
  return { kind, severity: INCIDENT_SEVERITY[kind], url, detail };
}

/** スナップショット → 事故の一覧（純粋。保存する前に呼ぶ） */
export function incidentsFromSnapshot(s: Omit<MonitorSnapshot, "incidents">): Incident[] {
  const out: Incident[] = [];
  const siteHost = hostOf(s.origin);
  for (const p of s.pages) {
    if (p.error !== null || p.status === null) {
      out.push(make(p.home ? "down" : "error_page", p.url, p.error ?? "応答がありません"));
      continue;
    }
    if (p.status >= 400) {
      out.push(make(p.home ? "down" : "error_page", p.url, `HTTP ${p.status}`));
      continue;
    }
    const finalHost = p.finalUrl ? hostOf(p.finalUrl) : null;
    if (finalHost && siteHost && finalHost !== siteHost) out.push(make("redirect_offsite", p.url, `${finalHost} へ転送されています`));
    if (p.noindex) out.push(make("noindex", p.url, "meta robots または X-Robots-Tag に noindex"));
    if (p.canonicalHost && siteHost && p.canonicalHost !== siteHost) out.push(make("canonical_offsite", p.url, `canonical が ${p.canonicalHost} を指しています`));
    if (p.jsonLdErrors > 0) out.push(make("jsonld_broken", p.url, `JSON-LD ${p.jsonLdErrors} 件が読めません`));
    if (!p.title) out.push(make("title_missing", p.url, "title が空です"));
    if (p.ms !== null && p.ms > SLOW_MS) out.push(make("slow", p.url, `取得に ${(p.ms / 1000).toFixed(1)} 秒`));
    if (!p.robotsAllowed) out.push(make("robots_block", p.url, "robots.txt が Googlebot のアクセスを拒否しています"));
  }
  if (s.robots.blocksAll) out.push(make("robots_block", null, "robots.txt がサイト全体（/）を拒否しています"));
  if (!s.sitemap.ok) out.push(make("sitemap_missing", s.sitemap.url, s.sitemap.status === null ? "取得できません" : `HTTP ${s.sitemap.status}`));
  if (s.links.broken.length >= BROKEN_LINKS_MIN) out.push(make("broken_links", null, `${s.links.checked} 本のうち ${s.links.broken.length} 本が切れています`));
  if (s.ssl) {
    if (s.ssl.error) out.push(make("ssl_invalid", null, s.ssl.error));
    else if (s.ssl.daysLeft !== null && s.ssl.daysLeft < 0) out.push(make("ssl_expired", null, `${s.ssl.validTo ?? ""} に切れています`));
    else if (s.ssl.daysLeft !== null && s.ssl.daysLeft <= SSL_WARN_DAYS) out.push(make("ssl_expiring", null, `あと ${s.ssl.daysLeft} 日（${s.ssl.validTo ?? ""}）`));
  }
  // 同じ種類 + URL は 1 件に
  const seen = new Set<string>();
  return out.filter((i) => {
    const k = incidentKey(i);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** 前回との差分（無ければ全部 opened） */
export function diffIncidents(previous: readonly Incident[] | null, current: readonly Incident[]): MonitorDiff {
  const prevKeys = new Set((previous ?? []).map(incidentKey));
  const curKeys = new Set(current.map(incidentKey));
  return {
    opened: current.filter((i) => !prevKeys.has(incidentKey(i))),
    ongoing: current.filter((i) => prevKeys.has(incidentKey(i))),
    resolved: (previous ?? []).filter((i) => !curKeys.has(incidentKey(i))),
  };
}

/** 知らせの文面（純粋） */
export function buildIncidentAlert(origin: string, opened: readonly Incident[], resolved: readonly Incident[]): { title: string; body: string } {
  const host = hostOf(origin) ?? origin;
  const critical = opened.filter((i) => i.severity === "critical").length;
  const lines = opened.map((i) => `・${i.severity === "critical" ? "【重大】" : ""}${labelOf(i.kind)}${i.url ? `（${i.url}）` : ""}: ${i.detail}`);
  const fixed = resolved.length > 0 ? `\n\n直ったもの: ${resolved.map((i) => labelOf(i.kind)).join("、")}` : "";
  return {
    title: critical > 0 ? `${host} で重大な事故が ${critical} 件見つかりました` : `${host} で確認が要る点が ${opened.length} 件あります`,
    body: `今週の確認で、前回は無かった問題です。放っておくと検索からの流入が減ります。\n${lines.join("\n")}${fixed}`,
  };
}

function labelOf(kind: IncidentKind): string {
  // 循環参照を避けるためここで引く
  const labels: Record<IncidentKind, string> = {
    down: "トップページに接続できない",
    error_page: "主要ページがエラー",
    noindex: "noindex が付いている",
    robots_block: "robots.txt が検索エンジンを拒否",
    redirect_offsite: "別のサイトに転送されている",
    canonical_offsite: "canonical が別のサイトを指している",
    ssl_expired: "SSL 証明書が切れている",
    ssl_expiring: "SSL 証明書の期限が近い",
    ssl_invalid: "SSL 証明書が正しくない",
    jsonld_broken: "構造化データが読めない",
    broken_links: "リンク切れ",
    sitemap_missing: "サイトマップが取得できない",
    slow: "表示が遅い",
    title_missing: "title が無い",
  };
  return labels[kind];
}
