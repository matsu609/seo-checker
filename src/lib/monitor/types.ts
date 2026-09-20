/**
 * サイトの事故監視の型（クライアントでも読める）。
 *
 * 「事故」= 放っておくと検索からの流入が止まるもの。noindex の混入・robots.txt での全拒否・
 * トップや主要ページのエラー・別サイトへの転送・証明書の期限切れ・リンク切れの増加・構造化データの崩れ。
 * 毎週の確認で前回と比べ、新しく起きたものだけを知らせる（同じ事故を毎週知らせない）。
 */

export const INCIDENT_KINDS = [
  "down",
  "error_page",
  "noindex",
  "robots_block",
  "redirect_offsite",
  "canonical_offsite",
  "ssl_expired",
  "ssl_expiring",
  "ssl_invalid",
  "jsonld_broken",
  "broken_links",
  "sitemap_missing",
  "slow",
  "title_missing",
] as const;

export type IncidentKind = (typeof INCIDENT_KINDS)[number];

export type IncidentSeverity = "critical" | "warning";

export const INCIDENT_LABELS: Record<IncidentKind, string> = {
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

export const INCIDENT_SEVERITY: Record<IncidentKind, IncidentSeverity> = {
  down: "critical",
  error_page: "critical",
  noindex: "critical",
  robots_block: "critical",
  redirect_offsite: "critical",
  canonical_offsite: "warning",
  ssl_expired: "critical",
  ssl_expiring: "warning",
  ssl_invalid: "critical",
  jsonld_broken: "warning",
  broken_links: "warning",
  sitemap_missing: "warning",
  slow: "warning",
  title_missing: "warning",
};

export interface PageCheck {
  url: string;
  /** トップページか（事故の重さが変わる） */
  home: boolean;
  finalUrl: string | null;
  status: number | null;
  ms: number | null;
  noindex: boolean;
  /** robots.txt が Googlebot に許可しているか（robots.txt が無ければ true） */
  robotsAllowed: boolean;
  canonicalHost: string | null;
  title: string | null;
  jsonLdBlocks: number;
  jsonLdErrors: number;
  /** 接続できなかったときの理由 */
  error: string | null;
}

export interface LinkCheck {
  url: string;
  status: number | null;
  error: string | null;
}

export interface SslCheck {
  /** 証明書の有効期限（ISO）。取れなければ null */
  validTo: string | null;
  daysLeft: number | null;
  /** 検証に失敗した理由（自己署名・ホスト名不一致など）。正常なら null */
  error: string | null;
}

export interface Incident {
  kind: IncidentKind;
  severity: IncidentSeverity;
  /** 対象の URL（サイト全体の事故は null） */
  url: string | null;
  /** 画面にそのまま出す 1 行 */
  detail: string;
}

export interface MonitorSnapshot {
  origin: string;
  checkedAt: string;
  pages: PageCheck[];
  links: { checked: number; broken: LinkCheck[] };
  robots: { fetched: boolean; blocksAll: boolean };
  sitemap: { url: string; ok: boolean; status: number | null };
  ssl: SslCheck | null;
  incidents: Incident[];
}

export interface MonitorDiff {
  /** 今回新しく起きた */
  opened: Incident[];
  /** 前回あって今回は無い（直った） */
  resolved: Incident[];
  /** 前回も今回もある */
  ongoing: Incident[];
}

/** 事故の同一性（種類 + URL）。件数や文面が変わっても同じ事故 */
export function incidentKey(i: Pick<Incident, "kind" | "url">): string {
  return `${i.kind} ${i.url ?? ""}`;
}
