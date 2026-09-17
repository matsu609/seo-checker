import { describe, expect, it } from "vitest";
import { deviceOf, isBotUserAgent } from "../bot";
import { cleanPath, CollectBodySchema, toRows } from "../collect";
import { jstDay, visitorId } from "../visitor";

const ctx = { day: "2026-09-17", ip: "203.0.113.5", userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)" };

describe("収集口の入力", () => {
  it("ページビューを行にする（参照元の分類・UTM・端末）", () => {
    const body = CollectBodySchema.parse({
      site: "abcdefghijklmnopqrst",
      events: [{ t: "pageview", p: "/menu?utm_source=line&utm_medium=social#top", r: "https://www.google.com/", h: "example.jp", u: { utm_source: "line", utm_medium: "social" } }],
    });
    const [r] = toRows(body, ctx);
    expect(r).toMatchObject({ site_key: "abcdefghijklmnopqrst", day: "2026-09-17", type: "pageview", path: "/menu", channel: "social", source: "line", utm_source: "line", device: "mobile" });
    expect(r.visitor).toHaveLength(32);
  });

  it("自サイトからの参照はホストを保存しない", () => {
    const body = CollectBodySchema.parse({ site: "abcdefghijklmnopqrst", events: [{ t: "pageview", p: "/a", r: "https://example.jp/", h: "example.jp" }] });
    expect(toRows(body, ctx)[0]).toMatchObject({ channel: "internal", referrer_host: "" });
  });

  it("離脱・タップ・フォームの行", () => {
    const body = CollectBodySchema.parse({
      site: "abcdefghijklmnopqrst",
      events: [
        { t: "leave", p: "/", s: 12.6, sc: 55 },
        { t: "click", p: "/", k: "external", x: "https://reserve.example.com/x" },
        { t: "click", p: "/", k: "tel" },
        { t: "form", p: "/contact" },
      ],
    });
    const rows = toRows(body, ctx);
    expect(rows[0]).toMatchObject({ type: "leave", seconds: 13, scroll: 55 });
    expect(rows[1]).toMatchObject({ type: "click", kind: "external", source: "reserve.example.com" });
    expect(rows[2]).toMatchObject({ type: "click", kind: "tel" });
    expect(rows[3]).toMatchObject({ type: "form", kind: "form", path: "/contact" });
  });

  it("壊れた入力は受けない（件数上限・知らない種類）", () => {
    expect(CollectBodySchema.safeParse({ site: "abcdefghijklmnopqrst", events: [] }).success).toBe(false);
    expect(CollectBodySchema.safeParse({ site: "abcdefghijklmnopqrst", events: [{ t: "hack", p: "/" }] }).success).toBe(false);
    expect(CollectBodySchema.safeParse({ site: "short", events: [{ t: "form", p: "/" }] }).success).toBe(false);
  });

  it("cleanPath はクエリとハッシュを落とす", () => {
    expect(cleanPath("/a?x=1#y")).toBe("/a");
    expect(cleanPath("a")).toBe("/a");
  });
});

describe("訪問者 ID とクローラ判定", () => {
  it("同じ日・同じ人なら同じ ID、日が変わると別", () => {
    const a = visitorId("2026-09-17", "site", "203.0.113.5", "UA");
    expect(visitorId("2026-09-17", "site", "203.0.113.5", "UA")).toBe(a);
    expect(visitorId("2026-09-18", "site", "203.0.113.5", "UA")).not.toBe(a);
    expect(visitorId("2026-09-17", "other", "203.0.113.5", "UA")).not.toBe(a);
    expect(a).not.toContain("203.0.113.5");
  });

  it("クローラの UA は弾き、端末は 2 値", () => {
    expect(isBotUserAgent("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(true);
    expect(isBotUserAgent("Chrome-Lighthouse")).toBe(true);
    expect(isBotUserAgent(null)).toBe(true);
    expect(isBotUserAgent(ctx.userAgent)).toBe(false);
    expect(deviceOf(ctx.userAgent)).toBe("mobile");
    expect(deviceOf("Mozilla/5.0 (Windows NT 10.0)")).toBe("desktop");
  });

  it("日本時間の日付", () => {
    expect(jstDay(new Date("2026-09-17T16:30:00Z"))).toBe("2026-09-18");
    expect(jstDay(new Date("2026-09-17T14:59:00Z"))).toBe("2026-09-17");
  });
});
