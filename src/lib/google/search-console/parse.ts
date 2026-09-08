/**
 * Search Console の応答 → アプリで使う形。
 *
 * 既存の GA4 クライアントと同じ方針で、例外は投げずに欠けた値を埋める。
 * 行が無い・キーが足りない・数値が文字列で来る、はどれも普通に起きる。
 */
import type { SearchAnalyticsRow, SearchConsoleSite } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** 数値にする。数にできなければ 0 */
export function num(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/** ドメインプロパティ（sc-domain:example.com）か */
export function isDomainProperty(siteUrl: string): boolean {
  return siteUrl.startsWith("sc-domain:");
}

/** 画面に出す名前。ドメインプロパティは接頭辞を外して「（ドメイン）」を付ける */
export function siteLabel(siteUrl: string): string {
  if (isDomainProperty(siteUrl)) return `${siteUrl.slice("sc-domain:".length)}（ドメイン）`;
  return siteUrl;
}

/** sites.list の応答を解析する */
export function parseSites(payload: unknown): SearchConsoleSite[] {
  const root = isRecord(payload) ? payload : {};
  const entries = Array.isArray(root.siteEntry) ? root.siteEntry : [];
  const sites: SearchConsoleSite[] = [];
  for (const raw of entries) {
    if (!isRecord(raw)) continue;
    const siteUrl = typeof raw.siteUrl === "string" ? raw.siteUrl : "";
    if (!siteUrl) continue;
    sites.push({
      siteUrl,
      permissionLevel: typeof raw.permissionLevel === "string" ? raw.permissionLevel : "",
      isDomainProperty: isDomainProperty(siteUrl),
      label: siteLabel(siteUrl),
    });
  }
  // 表示順を安定させる（ドメインプロパティを先に、あとは名前順）
  return sites.sort((a, b) => {
    if (a.isDomainProperty !== b.isDomainProperty) return a.isDomainProperty ? -1 : 1;
    return a.label.localeCompare(b.label, "ja");
  });
}

/** searchAnalytics.query の応答を解析する */
export function parseSearchAnalytics(payload: unknown): SearchAnalyticsRow[] {
  const root = isRecord(payload) ? payload : {};
  const rawRows = Array.isArray(root.rows) ? root.rows : [];
  const rows: SearchAnalyticsRow[] = [];
  for (const raw of rawRows) {
    if (!isRecord(raw)) continue;
    rows.push({
      keys: Array.isArray(raw.keys) ? raw.keys.map((k) => (typeof k === "string" ? k : "")) : [],
      clicks: num(raw.clicks),
      impressions: num(raw.impressions),
      ctr: num(raw.ctr),
      position: num(raw.position),
    });
  }
  return rows;
}

/** 行の合計を出す（CTR と掲載順位は表示回数で重み付けする） */
export function totalsOf(rows: readonly SearchAnalyticsRow[]): Omit<SearchAnalyticsRow, "keys"> {
  let clicks = 0;
  let impressions = 0;
  let positionWeighted = 0;
  for (const r of rows) {
    clicks += r.clicks;
    impressions += r.impressions;
    positionWeighted += r.position * r.impressions;
  }
  return {
    clicks,
    impressions,
    // 合計の CTR は「合計クリック ÷ 合計表示」。行ごとの CTR の平均ではない
    ctr: impressions > 0 ? clicks / impressions : 0,
    // 平均掲載順位は表示回数で重み付けする。単純平均だと、表示 1 回で 1 位の
    // ロングテールが全体を引き上げてしまう
    position: impressions > 0 ? positionWeighted / impressions : 0,
  };
}
