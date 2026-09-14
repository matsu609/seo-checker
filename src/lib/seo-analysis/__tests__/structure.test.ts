import { describe, expect, it } from "vitest";
import { ORIGIN, html, pageFrom } from "@/lib/audit/__tests__/fixtures";
import { applyDepths } from "@/lib/audit/run";
import type { AuditPage } from "@/lib/audit/types";
import { analyzeStructure, findCannibalization, pageRank } from "../structure";

interface Spec {
  path: string;
  /** 本文のリンク（href, text） */
  content?: [string, string][];
  /** ナビのリンク */
  nav?: string[];
  title?: string;
  h1?: string;
  modified?: string;
  breadcrumb?: boolean;
}

function site(specs: Spec[]): AuditPage[] {
  const pages = specs.map((s) => {
    const nav = (s.nav ?? []).map((h) => `<a href="${h}">nav</a>`).join("");
    const content = (s.content ?? []).map(([h, t]) => `<a href="${h}">${t}</a>`).join("");
    const head = [
      `<title>${s.title ?? s.path}</title>`,
      s.modified ? `<meta property="article:modified_time" content="${s.modified}">` : "",
    ].join("");
    const body = `<nav>${nav}</nav>${s.breadcrumb ? '<nav class="breadcrumb"><a href="/">ホーム</a></nav>' : ""}<main><h1>${s.h1 ?? s.path}</h1><p>${content}</p></main>`;
    return pageFrom(html({ head, body }), { url: `${ORIGIN}${s.path}`, finalUrl: `${ORIGIN}${s.path}` });
  });
  applyDepths(pages, `${ORIGIN}/`);
  return pages;
}

const NOW = new Date("2026-09-14T00:00:00Z");

describe("サイトの構成", () => {
  const pages = site([
    { path: "/", nav: ["/service", "/company", "/contact"], content: [["/blog/post-1", "SEO の基礎を解説"], ["/blog/post-2", "こちら"]] },
    { path: "/service", nav: ["/", "/service", "/company", "/contact"], content: [["/contact", "詳しくはこちら"]], breadcrumb: true },
    { path: "/company", nav: ["/", "/service", "/company", "/contact"], breadcrumb: true },
    { path: "/contact", nav: ["/", "/service", "/company", "/contact"] },
    { path: "/blog/post-1", nav: ["/"], content: [["/blog/post-2", "関連記事: 内部リンクの設計"]], modified: "2026-08-01" },
    { path: "/blog/post-2", nav: ["/"], content: [["/blog/post-3", "続きを読む"]], modified: "2024-01-01" },
    { path: "/blog/post-3", nav: ["/"], modified: "2023-06-01" },
    { path: "/old/lonely", title: "孤立したページ" },
  ]);
  const s = analyzeStructure(pages, `${ORIGIN}/`, { now: NOW });

  it("被リンク・本文からの被リンク・発リンクを数える", () => {
    const row = (path: string) => s.pages.find((p) => p.url === `${ORIGIN}${path}`)!;
    // /contact への被リンク: / と /company のナビ、/service（ナビと本文の両方 = 1 ページ 1 本）
    expect(row("/contact")).toMatchObject({ inlinks: 3, inContentInlinks: 1, kind: "contact" });
    expect(row("/blog/post-3")).toMatchObject({ inlinks: 1, inContentInlinks: 1, outlinks: 1, kind: "article" });
    expect(row("/old/lonely")).toMatchObject({ inlinks: 0, depth: null });
    expect(s.links.orphans).toEqual([`${ORIGIN}/old/lonely`]);
    expect(s.links.deadEnds).toEqual([`${ORIGIN}/old/lonely`]);
  });

  it("重要度はトップが 100 で、リンクの多いページほど高い", () => {
    const home = s.pages.find((p) => p.url === `${ORIGIN}/`)!;
    const lonely = s.pages.find((p) => p.url === `${ORIGIN}/old/lonely`)!;
    expect(home.importance).toBe(100);
    expect(s.topPages[0].url).toBe(`${ORIGIN}/`);
    expect(lonely.importance).toBeLessThan(home.importance);
  });

  it("階層の分布と到達できないページ", () => {
    const bucket = (label: string) => s.depth.buckets.find((b) => b.label === label)?.count;
    expect(bucket("0")).toBe(1);
    expect(bucket("1")).toBe(5);
    expect(bucket("2")).toBe(1);
    expect(bucket("unreachable")).toBe(1);
    expect(s.depth.unreachable).toBe(1);
    expect(s.depth.maxDepth).toBe(2);
  });

  it("汎用アンカー（こちら・続きを読む）の割合を出す", () => {
    // 本文のリンク: SEO の基礎 / こちら / 詳しくはこちら / 関連記事 / 続きを読む = 5 本中 3 本
    expect(s.links.anchors.total).toBe(5);
    expect(s.links.anchors.generic).toBe(3);
    expect(s.links.anchors.genericShare).toBe(0.6);
    expect(s.links.anchors.samples).toContain("詳しくはこちら");
  });

  it("集客に効くページでリンクが弱いものを挙げる", () => {
    const weak = s.weakKeyPages.map((p) => p.url);
    // /company は本文からの被リンク 0、/contact は 1、/service は 0
    expect(weak).toContain(`${ORIGIN}/company`);
    expect(weak).toContain(`${ORIGIN}/service`);
    expect(weak).toContain(`${ORIGIN}/contact`);
  });

  it("ページ種別・パンくず・鮮度を集計する", () => {
    expect(s.kinds.find((k) => k.kind === "article")?.count).toBe(3);
    expect(s.coverage.breadcrumb).toEqual({ count: 2, of: 7 });
    expect(s.freshness).toEqual({ withDates: 3, newest: "2026-08-01", oldest: "2023-06-01", olderThanYear: 2 });
    expect(s.links.inContentShare).toBeGreaterThan(0);
    expect(s.links.concentration.topPages).toBe(1);
  });
});

describe("pageRank", () => {
  it("リンクを多く受けるページほど高く、合計はほぼ 1", () => {
    const urls = ["a", "b", "c"];
    const out = new Map<string, string[]>([["a", ["b"]], ["b", ["c"]], ["c", ["b"]]]);
    const rank = pageRank(urls, out);
    const sum = [...rank.values()].reduce((x, y) => x + y, 0);
    expect(sum).toBeCloseTo(1, 5);
    expect(rank.get("b")!).toBeGreaterThan(rank.get("a")!);
    expect(rank.get("c")!).toBeGreaterThan(rank.get("a")!);
  });

  it("ページが無ければ空", () => {
    expect(pageRank([], new Map()).size).toBe(0);
  });
});

describe("カニバリ候補", () => {
  it("サイト名を除いた title や h1 が揃うページを組にする", () => {
    const pages = site([
      { path: "/a", title: "ウェブ制作の料金 | サンプル工房" },
      { path: "/b", title: "ウェブ制作の料金｜サンプル工房" },
      { path: "/c", title: "会社概要", h1: "採用情報" },
      { path: "/d", title: "採用のご案内", h1: "採用情報" },
      { path: "/e", title: "短い" },
    ]);
    const groups = findCannibalization(pages);
    expect(groups).toEqual([
      { key: "ウェブ制作の料金", field: "title", urls: [`${ORIGIN}/a`, `${ORIGIN}/b`] },
      { key: "採用情報", field: "h1", urls: [`${ORIGIN}/c`, `${ORIGIN}/d`] },
    ]);
  });
});
