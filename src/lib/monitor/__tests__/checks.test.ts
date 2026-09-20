import { describe, expect, it } from "vitest";
import { buildIncidentAlert, diffIncidents, incidentsFromSnapshot, internalLinksFrom, pageCheckFailed, pageCheckFromFetched } from "../checks";
import type { Incident, MonitorSnapshot, PageCheck } from "../types";

const headers = (map: Record<string, string> = {}) => ({ get: (name: string) => map[name.toLowerCase()] ?? null });
const fetched = (body: string, extra: Partial<{ status: number; finalUrl: string; headers: Record<string, string> }> = {}) => ({
  ok: (extra.status ?? 200) < 400,
  status: extra.status ?? 200,
  finalUrl: extra.finalUrl ?? "https://example.jp/",
  body,
  headers: headers(extra.headers),
});

describe("ページの状態の読み取り", () => {
  it("noindex・canonical・title・JSON-LD の崩れを拾う", () => {
    const html = `<html><head><title> 会社 A </title><meta name="robots" content="noindex,follow"><link rel="canonical" href="https://other.jp/x"><script type="application/ld+json">{bad json</script><script type="application/ld+json">{"@type":"Organization"}</script></head><body></body></html>`;
    const p = pageCheckFromFetched("https://example.jp/", true, fetched(html), 1234, true);
    expect(p).toMatchObject({ home: true, status: 200, ms: 1234, noindex: true, canonicalHost: "other.jp", title: "会社 A", jsonLdBlocks: 2, jsonLdErrors: 1, error: null });
  });

  it("X-Robots-Tag の noindex も見る", () => {
    const p = pageCheckFromFetched("https://example.jp/a", false, fetched("<html><title>a</title></html>", { headers: { "x-robots-tag": "noindex" } }), 10, true);
    expect(p.noindex).toBe(true);
  });

  it("トップの内部リンク（同じホスト・HTML らしいものだけ・重複なし）", () => {
    const html = `<a href="/about">a</a><a href="https://example.jp/about#x">b</a><a href="https://other.jp/">c</a><a href="/file.pdf">d</a><a href="mailto:x@y">e</a><a href="/">f</a><a href="/contact/">g</a>`;
    expect(internalLinksFrom("https://example.jp/", html)).toEqual(["https://example.jp/about", "https://example.jp/contact"]);
  });
});

function base(pages: PageCheck[], extra: Partial<Omit<MonitorSnapshot, "incidents" | "pages">> = {}): Omit<MonitorSnapshot, "incidents"> {
  return {
    origin: "https://example.jp",
    checkedAt: "2026-09-23T20:00:00Z",
    pages,
    links: { checked: 0, broken: [] },
    robots: { fetched: true, blocksAll: false },
    sitemap: { url: "https://example.jp/sitemap.xml", ok: true, status: 200 },
    ssl: { validTo: "2027-01-01T00:00:00Z", daysLeft: 100, error: null },
    ...extra,
  };
}
const okPage = (url: string, home = false): PageCheck => ({ url, home, finalUrl: url, status: 200, ms: 800, noindex: false, robotsAllowed: true, canonicalHost: "example.jp", title: "t", jsonLdBlocks: 0, jsonLdErrors: 0, error: null });

describe("事故の判定", () => {
  it("正常なら事故なし", () => {
    expect(incidentsFromSnapshot(base([okPage("https://example.jp/", true)]))).toEqual([]);
  });

  it("トップの接続失敗は down、下層のエラーは error_page。転送・noindex・遅い", () => {
    const list = incidentsFromSnapshot(
      base([
        pageCheckFailed("https://example.jp/", true, "timeout", true),
        { ...okPage("https://example.jp/a"), status: 404 },
        { ...okPage("https://example.jp/b"), finalUrl: "https://other.jp/b", noindex: true, ms: 6000 },
      ]),
    );
    expect(list.map((i) => [i.kind, i.url])).toEqual([
      ["down", "https://example.jp/"],
      ["error_page", "https://example.jp/a"],
      ["redirect_offsite", "https://example.jp/b"],
      ["noindex", "https://example.jp/b"],
      ["slow", "https://example.jp/b"],
    ]);
    expect(list[0].severity).toBe("critical");
    expect(list[4].severity).toBe("warning");
  });

  it("robots 全拒否・サイトマップ・リンク切れ・SSL", () => {
    const list = incidentsFromSnapshot(
      base([okPage("https://example.jp/", true)], {
        robots: { fetched: true, blocksAll: true },
        sitemap: { url: "https://example.jp/sitemap.xml", ok: false, status: 404 },
        links: { checked: 20, broken: [{ url: "https://example.jp/x", status: 404, error: null }] },
        ssl: { validTo: "2026-09-30T00:00:00Z", daysLeft: 6, error: null },
      }),
    );
    expect(list.map((i) => i.kind)).toEqual(["robots_block", "sitemap_missing", "broken_links", "ssl_expiring"]);
    expect(incidentsFromSnapshot(base([okPage("https://example.jp/", true)], { ssl: { validTo: null, daysLeft: null, error: "自己署名" } })).map((i) => i.kind)).toEqual(["ssl_invalid"]);
    expect(incidentsFromSnapshot(base([okPage("https://example.jp/", true)], { ssl: { validTo: "2026-01-01T00:00:00Z", daysLeft: -3, error: null } })).map((i) => i.kind)).toEqual(["ssl_expired"]);
  });
});

describe("前回との差分と知らせ", () => {
  const a: Incident = { kind: "noindex", severity: "critical", url: "https://example.jp/", detail: "x" };
  const b: Incident = { kind: "slow", severity: "warning", url: "https://example.jp/a", detail: "y" };
  it("新しく起きた・続いている・直った", () => {
    const d = diffIncidents([a], [a, b]);
    expect(d).toEqual({ opened: [b], ongoing: [a], resolved: [] });
    expect(diffIncidents([a, b], [b]).resolved).toEqual([a]);
    expect(diffIncidents(null, [a]).opened).toEqual([a]);
  });

  it("文面は重大の件数を見出しに", () => {
    const alert = buildIncidentAlert("https://example.jp", [a, b], [{ kind: "broken_links", severity: "warning", url: null, detail: "" }]);
    expect(alert.title).toBe("example.jp で重大な事故が 1 件見つかりました");
    expect(alert.body).toContain("【重大】noindex が付いている（https://example.jp/）: x");
    expect(alert.body).toContain("直ったもの: リンク切れ");
    expect(buildIncidentAlert("https://example.jp", [b], []).title).toBe("example.jp で確認が要る点が 1 件あります");
  });
});
