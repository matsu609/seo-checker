/**
 * 事実シートの組み立て（純関数。ネットワークにも DB にも出ない）。
 *
 * 収集した各領域の結果を SeoFactSheet にまとめ、`facts` に 1 行ずつ ID を振る。
 * ID は「領域の頭文字-連番」（S-03 など）。AI は facts だけを読み、主張ごとに
 * この ID を引用する。ここで作る文言はそのまま画面の付録（事実シート）にも出す。
 */
import type { AuditResult, AuditPageRow } from "@/lib/audit/types";
import { CRUX_METRIC_LABELS, CRUX_STATUS_LABELS, type CruxMetricId, type CruxRecord } from "@/lib/crux/types";
import { formatCrux, trendOf } from "@/lib/crux/parse";
import { CRUX_LABELS } from "@/lib/psi/types";
import { SERP_FEATURE_LABELS } from "@/lib/serp/types";
import { PAGE_KIND_LABELS } from "../types";
import {
  FACT_AREA_LABELS,
  GOAL_LABELS,
  SHEET_VERSION,
  type AnalysisInput,
  type Fact,
  type FactArea,
  type SeoFactSheet,
  type SheetGoogle,
  type SheetSearch,
  type SheetSite,
  type SheetSpeed,
} from "./types";

/** ルール別の上位に載せる件数 */
const TOP_RULES = 15;
const RULE_EXAMPLES = 3;
/** 事実シートに載せる一覧の上限 */
const LIST_LIMIT = 10;
const MAX_FACTS = 400;

export interface BuildSheetInput {
  input: AnalysisInput;
  audit: AuditResult;
  quick: SheetSite["quick"];
  speed: SheetSpeed;
  search: SheetSearch;
  google: SheetGoogle;
  coverage: SeoFactSheet["coverage"];
  generatedAt?: string;
}

export function buildFactSheet(args: BuildSheetInput): SeoFactSheet {
  const site = buildSiteSection(args.audit, args.quick);
  const partial: Omit<SeoFactSheet, "facts"> = {
    version: SHEET_VERSION,
    generatedAt: args.generatedAt ?? new Date().toISOString(),
    input: args.input,
    site,
    speed: args.speed,
    search: args.search,
    google: args.google,
    coverage: args.coverage,
  };
  return { ...partial, facts: buildFacts(partial) };
}

export function buildSiteSection(audit: AuditResult, quick: SheetSite["quick"]): SheetSite {
  const examplesByRule = new Map<string, string[]>();
  for (const issue of audit.issues) {
    const list = examplesByRule.get(issue.ruleId) ?? [];
    if (list.length < RULE_EXAMPLES && !list.includes(issue.url)) list.push(issue.url);
    examplesByRule.set(issue.ruleId, list);
  }
  const structure = audit.structure ?? emptyStructure();
  const { pages: _pages, ...structureWithoutPages } = structure;
  void _pages;
  return {
    origin: audit.origin,
    startUrl: audit.startUrl,
    crawledAt: audit.crawledAt,
    crawl: audit.crawl,
    bySeverity: audit.bySeverity,
    byCategory: audit.byCategory.map((c) => ({ category: c.category, count: c.count })),
    topRules: audit.byRule.slice(0, TOP_RULES).map((r) => ({ ...r, examples: examplesByRule.get(r.ruleId) ?? [] })),
    structure: structureWithoutPages,
    trust: audit.trust ?? { pages: { company: null, contact: null, privacy: null, terms: null, tokushoho: null }, organization: null, nap: { phones: [], schemaTelephone: null, consistent: null, pagesWithAddress: 0 }, contact: { pagesWithPhone: 0, pagesWithEmail: 0, phoneOnHome: false }, author: { articles: 0, withAuthor: 0 }, checks: [] },
    quick,
  };
}

function emptyStructure(): NonNullable<AuditResult["structure"]> {
  return {
    pageCount: 0,
    depth: { buckets: [], deep: 0, unreachable: 0, maxDepth: 0 },
    links: { total: 0, avgOutlinks: 0, inContentShare: 0, deadEnds: [], orphans: [], withoutContentInlinks: 0, nofollow: 0, concentration: { topPages: 0, share: 0 }, anchors: { total: 0, generic: 0, genericShare: 0, samples: [] } },
    topPages: [],
    weakKeyPages: [],
    kinds: [],
    coverage: { breadcrumb: { count: 0, of: 0 }, hreflang: { count: 0 }, og: { complete: 0, of: 0 } },
    freshness: { withDates: 0, newest: null, oldest: null, olderThanYear: 0 },
    cannibalization: [],
    pages: [],
  };
}

/* ───────────── facts ───────────── */

class FactList {
  readonly facts: Fact[] = [];
  private readonly counters = new Map<FactArea, number>();

  add(area: FactArea, label: string, value: string, extra: { note?: string; url?: string } = {}): void {
    if (this.facts.length >= MAX_FACTS) return;
    const n = (this.counters.get(area) ?? 0) + 1;
    this.counters.set(area, n);
    const prefix = area === "input" ? "I" : area === "crawl" ? "C" : area === "structure" ? "S" : area === "trust" ? "T" : area === "speed" ? "P" : area === "search" ? "R" : "G";
    this.facts.push({ id: `${prefix}-${String(n).padStart(2, "0")}`, area, label, value, ...(extra.note ? { note: extra.note } : {}), ...(extra.url ? { url: extra.url } : {}) });
  }
}

export function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function path(url: string): string {
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}` || "/";
  } catch {
    return url;
  }
}

export function buildFacts(sheet: Omit<SeoFactSheet, "facts">): Fact[] {
  const f = new FactList();
  const { input, site, speed, search, google } = sheet;

  // --- 入力 ------------------------------------------------------------------
  f.add("input", "対象サイト", site.origin, { note: `開始 URL ${site.startUrl}` });
  f.add("input", "サイトの目的", GOAL_LABELS[input.goal]);
  if (input.industry) f.add("input", "業種", input.industry);
  if (input.region) f.add("input", "地域", input.region);
  if (input.keywords.length > 0) f.add("input", "対策キーワード", input.keywords.join(" / "));
  if (input.competitors.length > 0) f.add("input", "競合サイト", input.competitors.join(" / "));

  // --- クロール ----------------------------------------------------------------
  f.add("crawl", "診断したページ数", `${site.crawl.analyzed} ページ`, {
    note: `発見 ${site.crawl.discovered} / 取得失敗 ${site.crawl.failed} / サイトマップ由来 ${site.crawl.sitemapCount} / 内部リンクのみ ${site.crawl.linkCount}${site.crawl.truncated ? `（上限 ${site.crawl.truncated.limit} で打ち切り）` : ""}`,
  });
  f.add("crawl", "検出した課題", `${site.bySeverity.error + site.bySeverity.warning + site.bySeverity.info} 件`, {
    note: `重大 ${site.bySeverity.error} / 警告 ${site.bySeverity.warning} / 情報 ${site.bySeverity.info}`,
  });
  const cats = site.byCategory.filter((c) => c.count > 0).sort((a, b) => b.count - a.count);
  if (cats.length > 0) f.add("crawl", "カテゴリ別の課題数", cats.map((c) => `${c.category} ${c.count}`).join(" / "));
  for (const r of site.topRules) {
    f.add("crawl", `課題: ${r.ruleId}`, `${r.count} 件（${r.category}・${r.severity === "error" ? "重大" : r.severity === "warning" ? "警告" : "情報"}）`, {
      note: r.examples.length > 0 ? `例: ${r.examples.map(path).join(", ")}` : undefined,
    });
  }
  if (site.quick) {
    f.add("crawl", "クイック診断の総合スコア（トップページ）", `${site.quick.score} 点`, {
      note: site.quick.categories.map((c) => `${c.label} ${c.score}`).join(" / "),
    });
  }

  // --- 構成 --------------------------------------------------------------------
  const s = site.structure;
  f.add("structure", "内部リンクの延べ本数", `${s.links.total} 本`, { note: `1 ページあたり平均 ${s.links.avgOutlinks} 本` });
  f.add("structure", "本文中のリンクの割合", pct(s.links.inContentShare), { note: "残りはナビ・ヘッダー・フッター・サイドバーのリンク" });
  f.add("structure", "本文からの被リンクが無いページ", `${s.links.withoutContentInlinks} ページ`);
  f.add("structure", "内部リンクで到達できないページ", `${s.depth.unreachable} ページ`, { note: s.links.orphans.slice(0, 3).map(path).join(", ") || undefined });
  f.add("structure", "行き止まりのページ（発リンク 0）", `${s.links.deadEnds.length} ページ`, { note: s.links.deadEnds.slice(0, 3).map(path).join(", ") || undefined });
  f.add("structure", "トップから 4 クリック以上かかるページ", `${s.depth.deep} ページ`, { note: `最大 ${s.depth.maxDepth} クリック。分布: ${s.depth.buckets.map((b) => `${b.label}=${b.count}`).join(" ")}` });
  if (s.links.anchors.total > 0) {
    f.add("structure", "リンク先が分からないアンカーテキストの割合", pct(s.links.anchors.genericShare), {
      note: `本文のリンク ${s.links.anchors.total} 本中 ${s.links.anchors.generic} 本${s.links.anchors.samples.length > 0 ? `。例: ${s.links.anchors.samples.join(" / ")}` : ""}`,
    });
  }
  f.add("structure", "被リンクの集中", `上位 ${s.links.concentration.topPages} ページに ${pct(s.links.concentration.share)}`);
  if (s.kinds.length > 0) f.add("structure", "ページ種別の構成", s.kinds.map((k) => `${PAGE_KIND_LABELS[k.kind]} ${k.count}`).join(" / "));
  f.add("structure", "パンくずのあるページ", s.coverage.breadcrumb.of > 0 ? `${s.coverage.breadcrumb.count} / ${s.coverage.breadcrumb.of} ページ` : "判定対象なし");
  f.add("structure", "OG（title・description・image）がそろうページ", `${s.coverage.og.complete} / ${s.coverage.og.of} ページ`);
  if (s.coverage.hreflang.count > 0) f.add("structure", "hreflang のあるページ", `${s.coverage.hreflang.count} ページ`);
  f.add("structure", "更新日の分かるページ", s.freshness.withDates > 0 ? `${s.freshness.withDates} ページ` : "無し", {
    note: s.freshness.withDates > 0 ? `${s.freshness.oldest} 〜 ${s.freshness.newest}。1 年以上前 ${s.freshness.olderThanYear} ページ` : undefined,
  });
  if (s.cannibalization.length > 0) {
    f.add("structure", "同じ題名のページの組", `${s.cannibalization.length} 組`, {
      note: s.cannibalization.slice(0, 3).map((g) => `「${g.key}」${g.urls.map(path).join(", ")}`).join(" ／ "),
    });
  }
  for (const p of s.weakKeyPages.slice(0, 5)) {
    f.add("structure", `リンクの弱い重要ページ: ${path(p.url)}`, `${PAGE_KIND_LABELS[p.kind]}。本文からの被リンク ${p.inContentInlinks} 本`, { note: `被リンク全体 ${p.inlinks} 本、重要度 ${p.importance}、${p.depth === null ? "到達不可" : `${p.depth} クリック`}`, url: p.url });
  }
  for (const p of s.topPages.slice(0, 5)) {
    f.add("structure", `重要度上位: ${path(p.url)}`, `重要度 ${p.importance}（${PAGE_KIND_LABELS[p.kind]}）`, { note: `被リンク ${p.inlinks} 本（本文から ${p.inContentInlinks}）`, url: p.url });
  }

  // --- 信頼 --------------------------------------------------------------------
  for (const c of site.trust.checks) {
    f.add("trust", c.label, c.status === "pass" ? "合格" : c.status === "warn" ? "注意" : c.status === "fail" ? "未対応" : "参考", { note: c.detail, url: c.url });
  }

  // --- 速度 --------------------------------------------------------------------
  const cx = speed.crux;
  if (cx.origin) {
    addCruxFacts(f, "サイト全体（Origin）", cx.origin);
  } else if (cx.originFailure) {
    f.add("speed", "実ユーザーの速度（サイト全体）", cx.originFailure === "no-data" ? "データ不足" : "取得できず", { note: cx.originFailure === "no-data" ? "Chrome の実ユーザーが少ないため CrUX にデータがありません" : undefined });
  }
  if (cx.history) {
    for (const id of ["lcp", "inp", "cls"] as CruxMetricId[]) {
      const t = trendOf(cx.history.metrics[id]);
      if (!t) continue;
      const dir = t.last < t.first ? "改善" : t.last > t.first ? "悪化" : "横ばい";
      f.add("speed", `${CRUX_METRIC_LABELS[id]} の推移（サイト全体）`, `${formatCrux(id, t.first)} → ${formatCrux(id, t.last)}（${dir}）`, { note: `${t.firstDate} 〜 ${t.lastDate}` });
    }
  }
  for (const u of cx.urls) {
    if (u.record && u.record.scope === "url") addCruxFacts(f, path(u.url), u.record, u.url);
    else if (u.failure === "no-data" || (u.record && u.record.scope === "origin")) f.add("speed", `実ユーザーの速度: ${path(u.url)}`, "URL 単位のデータ不足（サイト全体の値を参照）", { url: u.url });
  }
  for (const p of speed.psi) {
    if (!p.result) {
      if (p.error) f.add("speed", `PageSpeed: ${p.label}`, "取得できず", { note: p.error, url: p.url });
      continue;
    }
    const r = p.result;
    f.add("speed", `PageSpeed の Performance: ${p.label}`, r.categories.performance === null ? "—" : `${r.categories.performance} 点`, {
      note: `Accessibility ${r.categories.accessibility ?? "—"} / SEO ${r.categories.seo ?? "—"}（${r.strategy === "mobile" ? "モバイル" : "デスクトップ"}）`,
      url: p.url,
    });
    const lab = [r.lab.lcp !== null ? `LCP ${(r.lab.lcp / 1000).toFixed(1)} 秒` : null, r.lab.tbt !== null ? `TBT ${Math.round(r.lab.tbt)} ms` : null, r.lab.cls !== null ? `CLS ${r.lab.cls.toFixed(2)}` : null].filter(Boolean);
    if (lab.length > 0) f.add("speed", `ラボ計測（Lighthouse）: ${p.label}`, lab.join(" / "), { url: p.url });
    if (r.crux) {
      const parts = (["lcp", "inp", "cls"] as const).map((id) => {
        const m = r.crux?.[id];
        return m ? `${id.toUpperCase()} ${id === "cls" ? m.value.toFixed(2) : `${(m.value / 1000).toFixed(1)} 秒`}（${CRUX_LABELS[m.category]}）` : null;
      }).filter(Boolean);
      if (parts.length > 0) f.add("speed", `PSI が返した実ユーザー値: ${p.label}`, parts.join(" / "), { url: p.url });
    }
    if (r.opportunities.length > 0) {
      f.add("speed", `改善余地（Lighthouse）: ${p.label}`, r.opportunities.map((o) => `${o.title}${o.displayValue ? `（${o.displayValue}）` : ""}`).join(" / "), { url: p.url });
    }
  }
  for (const n of speed.notes) f.add("speed", "注記", n);

  // --- 検索 --------------------------------------------------------------------
  for (const k of search.keywords) {
    f.add("search", `順位: 「${k.keyword}」`, k.rank === null ? "100 位以内に無し" : `${k.rank} 位`, {
      note: [
        k.url ? `該当ページ ${path(k.url)}` : null,
        k.topDomains.length > 0 ? `上位: ${k.topDomains.join(", ")}` : null,
        k.features.length > 0 ? `検索結果の特徴: ${k.features.map((x) => SERP_FEATURE_LABELS[x]).join("・")}` : null,
        k.aiOverview ? `AI Overviews あり（自社の引用 ${k.ownCited ? "あり" : "なし"}）` : null,
        k.competitors.length > 0 ? `競合: ${k.competitors.map((c) => `${c.host} ${c.rank === null ? "圏外" : `${c.rank} 位`}`).join(", ")}` : null,
      ].filter(Boolean).join("。") || undefined,
    });
  }
  if (search.siteCount !== null) f.add("search", "Google に登録されているページ数の目安（site: 検索）", `約 ${search.siteCount.toLocaleString("ja-JP")} 件`, { note: `診断したページ数 ${site.crawl.analyzed} と比べる` });
  if (search.brand) f.add("search", `ブランド名検索「${search.brand.query}」での自社の順位`, search.brand.rank === null ? "100 位以内に無し" : `${search.brand.rank} 位`, { url: search.brand.url ?? undefined });
  for (const n of search.notes) f.add("search", "注記", n);

  // --- Google 連携 ------------------------------------------------------------
  if (google.searchConsole) {
    const g = google.searchConsole;
    f.add("google", "検索パフォーマンス（直近 28 日）", `クリック ${g.totals.clicks.toLocaleString("ja-JP")} / 表示 ${g.totals.impressions.toLocaleString("ja-JP")} / CTR ${pct(g.totals.ctr)} / 平均掲載順位 ${g.totals.position.toFixed(1)}`, {
      note: `前の 28 日: クリック ${g.previousTotals.clicks.toLocaleString("ja-JP")} / 表示 ${g.previousTotals.impressions.toLocaleString("ja-JP")} / CTR ${pct(g.previousTotals.ctr)} / 順位 ${g.previousTotals.position.toFixed(1)}（${g.range.startDate} 〜 ${g.range.endDate}）`,
    });
    for (const q of g.queries.slice(0, LIST_LIMIT)) {
      f.add("google", `検索クエリ「${q.query}」`, `クリック ${q.clicks} / 表示 ${q.impressions} / CTR ${pct(q.ctr)} / 順位 ${q.position.toFixed(1)}`);
    }
    for (const p of g.pages.slice(0, LIST_LIMIT)) {
      f.add("google", `検索流入の多いページ ${path(p.page)}`, `クリック ${p.clicks} / 表示 ${p.impressions} / CTR ${pct(p.ctr)} / 順位 ${p.position.toFixed(1)}`, { url: p.page });
    }
  }
  if (google.ga4) {
    const a = google.ga4;
    f.add("google", "自然検索の流入（直近 28 日）", `セッション ${a.organic.sessions.toLocaleString("ja-JP")} / ユーザー ${a.organic.users.toLocaleString("ja-JP")} / エンゲージメント率 ${pct(a.organic.engagementRate)} / キーイベント ${a.organic.keyEvents.toLocaleString("ja-JP")}`, {
      note: `全チャネル: セッション ${a.all.sessions.toLocaleString("ja-JP")} / キーイベント ${a.all.keyEvents.toLocaleString("ja-JP")}（${a.range.startDate} 〜 ${a.range.endDate}）`,
    });
    for (const l of a.landing.slice(0, LIST_LIMIT)) {
      f.add("google", `自然検索のランディングページ ${l.page}`, `セッション ${l.sessions} / キーイベント ${l.keyEvents}`);
    }
  }
  for (const n of google.notes) f.add("google", "注記", n);

  return f.facts;
}

function addCruxFacts(f: FactList, label: string, record: CruxRecord, url?: string): void {
  const ids: CruxMetricId[] = ["lcp", "inp", "cls", "fcp", "ttfb"];
  const parts = ids
    .map((id) => {
      const m = record.metrics[id];
      return m ? `${id.toUpperCase()} ${formatCrux(id, m.p75)}（${CRUX_STATUS_LABELS[m.status]}）` : null;
    })
    .filter(Boolean);
  f.add("speed", `実ユーザーの速度（75 パーセンタイル）: ${label}`, parts.join(" / ") || "指標なし", {
    note: `${record.passesCoreWebVitals === null ? "Core Web Vitals の合否は判定不能" : record.passesCoreWebVitals ? "Core Web Vitals 合格" : "Core Web Vitals 不合格"}。集計期間 ${record.period.firstDate} 〜 ${record.period.lastDate}`,
    url,
  });
}

/** サイト診断の結果だけから facts を作る（画面ごとの AI 分析用。ブラウザでも呼べる） */
export function factsFromAudit(audit: AuditResult): Fact[] {
  const site = buildSiteSection(audit, null);
  const partial: Omit<SeoFactSheet, "facts"> = {
    version: SHEET_VERSION,
    generatedAt: audit.crawledAt,
    input: { url: audit.startUrl, keywords: [], industry: "", goal: "other", region: "", competitors: [], brand: "", maxPages: audit.crawl.maxPages },
    site,
    speed: { psi: [], crux: { origin: null, originFailure: null, history: null, urls: [] }, notes: [] },
    search: { keywords: [], siteCount: null, brand: null, notes: [] },
    google: { searchConsole: null, ga4: null, notes: [] },
    coverage: { psi: false, crux: false, serp: false, searchConsole: false, ga4: false },
  };
  return buildFacts(partial).filter((x) => x.area !== "input" || x.label === "対象サイト");
}

/** 事実シートをプロンプト用の行にする（1 行 = 1 事実） */
export function factsToLines(facts: readonly Fact[]): string[] {
  return facts.map((x) => `${x.id} [${FACT_AREA_LABELS[x.area]}] ${x.label}: ${x.value}${x.note ? `（${x.note}）` : ""}`);
}

/** 重要度の高い順にページを選ぶ（PSI・CrUX の対象。トップ + 上位 n） */
export function pickKeyPages(rows: readonly AuditPageRow[], entryUrl: string, count: number): { url: string; label: string }[] {
  const out: { url: string; label: string }[] = [{ url: entryUrl, label: "トップ" }];
  const rest = rows
    .filter((r) => r.url !== entryUrl && r.status >= 200 && r.status < 300 && !r.noindex)
    .sort((a, b) => b.importance - a.importance || b.inlinks - a.inlinks);
  for (const r of rest) {
    if (out.length >= count) break;
    out.push({ url: r.url, label: `重要度 ${out.length} 位 ${path(r.url)}` });
  }
  return out;
}
