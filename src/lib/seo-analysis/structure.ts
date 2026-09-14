/**
 * サイトの構成（内部リンクの向き・階層・重要度・ページ種別・鮮度）を
 * クロール結果から計算する。ネットワークには出ない純関数。
 *
 * 無料診断・サイト診断の「機械的な判定」の上に載せる、有料の差別化のための
 * 指標（docs/dev/seo-analysis-spec.md §0.1）。数字はすべて AuditPage から導く。
 */
import type { AuditPage } from "@/lib/audit/types";
import { pathDepth } from "@/lib/crawl/url";
import { classifyPage } from "./kinds";
import type {
  AnchorTextStats,
  CannibalGroup,
  DepthBucket,
  PageKind,
  SiteStructure,
  StructurePage,
} from "./types";

/** PageRank の減衰率と反復回数（サイト内リンクの規模なら 30 回で十分収束する） */
const DAMPING = 0.85;
const ITERATIONS = 30;
/** 上位に載せる件数 */
const TOP_PAGES = 10;
const WEAK_PAGES = 10;
const CANNIBAL_GROUPS = 20;
const ANCHOR_SAMPLES = 5;
/** 「深すぎる」とみなすクリック数 */
const DEEP_DEPTH = 4;
/** 被リンクの集中を見る上位の割合 */
const TOP_SHARE = 0.1;
/** 集客に効くページ種別（リンクが弱いと機会損失になる） */
const KEY_KINDS: ReadonlySet<PageKind> = new Set(["service", "contact", "company"]);

/**
 * リンク先が分からないアンカー。1 語だけで判定できるものに限る
 * （「サービス詳細はこちら」のように具体語が付いていれば汎用とはしない）。
 */
const GENERIC_ANCHOR_RE =
  /^(?:こちら|こちらから|こちらへ|詳しくはこちら|詳細はこちら|詳細|詳しく|詳しく見る|詳細を見る|もっと見る|続きを読む|続きはこちら|続き|次へ|前へ|もっと|一覧|一覧へ|一覧を見る|クリック|ここ|ここをクリック|read ?more|more|learn ?more|click ?here|here|view ?more|see ?more|details?|link|next|prev(?:ious)?|go|→|>>?|»)[。．.！!]?$/i;

export interface StructureOptions {
  /** 「今日」（鮮度の計算用。テストで固定する） */
  now?: Date;
}

export function analyzeStructure(
  pages: readonly AuditPage[],
  entryUrl: string,
  options: StructureOptions = {},
): SiteStructure {
  const now = options.now ?? new Date();
  const byUrl = new Map<string, AuditPage>();
  for (const page of pages) byUrl.set(page.url, page);
  const urls = [...byUrl.keys()];

  // --- リンクの向き（クロール済みページ間だけ） ------------------------------
  const inlinks = new Map<string, number>();
  const inContentInlinks = new Map<string, number>();
  const nofollowInlinks = new Map<string, number>();
  const outlinks = new Map<string, string[]>();
  for (const url of urls) {
    inlinks.set(url, 0);
    inContentInlinks.set(url, 0);
    nofollowInlinks.set(url, 0);
  }
  let total = 0;
  let inContentTotal = 0;
  let nofollowTotal = 0;
  const anchors: AnchorTextStats = { total: 0, generic: 0, genericShare: 0, samples: [] };

  for (const page of byUrl.values()) {
    const targets: string[] = [];
    for (const link of page.links) {
      if (link.url === page.url || !byUrl.has(link.url)) continue;
      total += 1;
      targets.push(link.url);
      inlinks.set(link.url, (inlinks.get(link.url) ?? 0) + 1);
      if (link.inContent) {
        inContentTotal += 1;
        inContentInlinks.set(link.url, (inContentInlinks.get(link.url) ?? 0) + 1);
        if (link.text) {
          anchors.total += 1;
          if (GENERIC_ANCHOR_RE.test(link.text.trim())) {
            anchors.generic += 1;
            if (anchors.samples.length < ANCHOR_SAMPLES && !anchors.samples.includes(link.text)) {
              anchors.samples.push(link.text);
            }
          }
        }
      }
      if (link.nofollow) {
        nofollowTotal += 1;
        nofollowInlinks.set(link.url, (nofollowInlinks.get(link.url) ?? 0) + 1);
      }
    }
    outlinks.set(page.url, targets);
  }
  anchors.genericShare = anchors.total > 0 ? round(anchors.generic / anchors.total) : 0;

  // --- 重要度（PageRank） ------------------------------------------------------
  const rank = pageRank(urls, outlinks);
  const maxRank = Math.max(...rank.values(), 0);

  // --- ページごとの行 ------------------------------------------------------------
  const rows: StructurePage[] = [...byUrl.values()].map((page) => ({
    url: page.url,
    title: page.title,
    kind: classifyPage({
      url: page.url,
      title: page.title,
      h1: page.h1,
      published: page.published,
      jsonLdTypes: page.jsonLd.types,
    }),
    depth: page.depth,
    urlDepth: pathDepth(page.url),
    inlinks: inlinks.get(page.url) ?? 0,
    inContentInlinks: inContentInlinks.get(page.url) ?? 0,
    outlinks: outlinks.get(page.url)?.length ?? 0,
    nofollowInlinks: nofollowInlinks.get(page.url) ?? 0,
    importance: maxRank > 0 ? Math.round(((rank.get(page.url) ?? 0) / maxRank) * 100) : 0,
  }));
  rows.sort((a, b) => b.importance - a.importance || b.inlinks - a.inlinks || a.url.localeCompare(b.url));

  // --- 階層 --------------------------------------------------------------------
  const bucketCounts = new Map<string, number>([["0", 0], ["1", 0], ["2", 0], ["3", 0], ["4+", 0], ["unreachable", 0]]);
  let maxDepth = 0;
  for (const row of rows) {
    const label = row.depth === null ? "unreachable" : row.depth >= DEEP_DEPTH ? "4+" : String(row.depth);
    bucketCounts.set(label, (bucketCounts.get(label) ?? 0) + 1);
    if (row.depth !== null && row.depth > maxDepth) maxDepth = row.depth;
  }
  const buckets: DepthBucket[] = [...bucketCounts.entries()].map(([label, count]) => ({ label, count }));

  // --- 被リンクの集中 ----------------------------------------------------------
  const byInlinks = [...rows].sort((a, b) => b.inlinks - a.inlinks);
  const topCount = Math.max(1, Math.ceil(rows.length * TOP_SHARE));
  const topInlinks = byInlinks.slice(0, topCount).reduce((sum, r) => sum + r.inlinks, 0);

  // --- 網羅（パンくず・hreflang・OG） ------------------------------------------
  const nonHome = [...byUrl.values()].filter((p) => p.url !== entryUrl);
  const breadcrumb = nonHome.filter((p) => p.hasBreadcrumb).length;
  const hreflang = [...byUrl.values()].filter((p) => p.hreflang.length > 0).length;
  const ogComplete = [...byUrl.values()].filter((p) => p.og.title && p.og.description && p.og.image).length;

  // --- 鮮度 --------------------------------------------------------------------
  const dates = [...byUrl.values()]
    .map((p) => p.modified ?? p.published)
    .filter((d): d is string => d !== null)
    .sort();
  const yearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  return {
    pageCount: rows.length,
    depth: {
      buckets,
      deep: bucketCounts.get("4+") ?? 0,
      unreachable: bucketCounts.get("unreachable") ?? 0,
      maxDepth,
    },
    links: {
      total,
      avgOutlinks: rows.length > 0 ? round(total / rows.length, 1) : 0,
      inContentShare: total > 0 ? round(inContentTotal / total) : 0,
      deadEnds: rows.filter((r) => r.outlinks === 0).map((r) => r.url),
      orphans: rows.filter((r) => r.inlinks === 0 && r.url !== entryUrl).map((r) => r.url),
      withoutContentInlinks: rows.filter((r) => r.inContentInlinks === 0 && r.url !== entryUrl).length,
      nofollow: nofollowTotal,
      concentration: { topPages: topCount, share: total > 0 ? round(topInlinks / total) : 0 },
      anchors,
    },
    topPages: rows.slice(0, TOP_PAGES),
    weakKeyPages: rows
      .filter((r) => KEY_KINDS.has(r.kind) && r.inContentInlinks <= 1)
      .sort((a, b) => a.inContentInlinks - b.inContentInlinks || a.inlinks - b.inlinks)
      .slice(0, WEAK_PAGES),
    kinds: countKinds(rows),
    coverage: {
      breadcrumb: { count: breadcrumb, of: nonHome.length },
      hreflang: { count: hreflang },
      og: { complete: ogComplete, of: rows.length },
    },
    freshness: {
      withDates: dates.length,
      newest: dates.length > 0 ? dates[dates.length - 1] : null,
      oldest: dates.length > 0 ? dates[0] : null,
      olderThanYear: dates.filter((d) => d < yearAgo).length,
    },
    cannibalization: findCannibalization([...byUrl.values()]),
    pages: rows,
  };
}

/**
 * PageRank（内部リンクの向きだけで見た重要度）。
 * 発リンクの無いページ（行き止まり）の分は全ページに均等に配る。
 */
export function pageRank(urls: readonly string[], outlinks: ReadonlyMap<string, readonly string[]>): Map<string, number> {
  const n = urls.length;
  const rank = new Map<string, number>();
  if (n === 0) return rank;
  for (const url of urls) rank.set(url, 1 / n);

  // 同じ先へ複数本あっても 1 本として扱う
  const targets = new Map<string, string[]>();
  for (const url of urls) targets.set(url, [...new Set(outlinks.get(url) ?? [])]);

  for (let i = 0; i < ITERATIONS; i += 1) {
    const next = new Map<string, number>();
    let dangling = 0;
    for (const url of urls) {
      if ((targets.get(url)?.length ?? 0) === 0) dangling += rank.get(url) ?? 0;
    }
    const base = (1 - DAMPING) / n + (DAMPING * dangling) / n;
    for (const url of urls) next.set(url, base);
    for (const url of urls) {
      const out = targets.get(url) ?? [];
      if (out.length === 0) continue;
      const share = (DAMPING * (rank.get(url) ?? 0)) / out.length;
      for (const t of out) next.set(t, (next.get(t) ?? 0) + share);
    }
    for (const [url, value] of next) rank.set(url, value);
  }
  return rank;
}

function countKinds(rows: readonly StructurePage[]): { kind: PageKind; count: number }[] {
  const counts = new Map<PageKind, number>();
  for (const row of rows) counts.set(row.kind, (counts.get(row.kind) ?? 0) + 1);
  return [...counts.entries()].map(([kind, count]) => ({ kind, count })).sort((a, b) => b.count - a.count);
}

/** title または h1 がそろっているページの組（重複 title のルールとは別に、検索意図の重なりを見るため h1 も見る） */
export function findCannibalization(pages: readonly AuditPage[]): CannibalGroup[] {
  const groups: CannibalGroup[] = [];
  const collect = (field: "title" | "h1", pick: (p: AuditPage) => string | null) => {
    const map = new Map<string, string[]>();
    for (const page of pages) {
      const value = pick(page);
      if (!value) continue;
      const key = normalizeKey(value);
      if (key.length < 4) continue;
      const list = map.get(key) ?? [];
      list.push(page.url);
      map.set(key, list);
    }
    for (const [key, urls] of map) {
      if (urls.length >= 2) groups.push({ key, field, urls: urls.sort() });
    }
  };
  collect("title", (p) => p.title);
  collect("h1", (p) => p.h1[0] ?? null);
  // 同じ組が title と h1 の両方で出たら title の方だけ残す
  const seen = new Set<string>();
  return groups
    .filter((g) => {
      const id = g.urls.join("|");
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .sort((a, b) => b.urls.length - a.urls.length || a.key.localeCompare(b.key))
    .slice(0, CANNIBAL_GROUPS);
}

function normalizeKey(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\s*[|｜\-–—:：]\s*[^|｜\-–—:：]*$/u, "") // 「記事名 | サイト名」のサイト名を落とす
    .replace(/[\s　]+/g, "")
    .trim();
}

function round(value: number, digits = 3): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}
