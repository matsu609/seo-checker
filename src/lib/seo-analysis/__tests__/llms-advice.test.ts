/**
 * 精密診断の llms.txt「追加すべきもの」（llms-advice.ts）。
 * 無いときは骨組み + サイトにあるページ種別のセクション + 候補ページ。あるときは足りないものだけ。
 */
import { describe, expect, it } from "vitest";
import { llmsAdvice } from "../llms-advice";
import type { SheetLlmsTxt } from "../sheet/types";
import type { StructurePage } from "../types";

const page = (url: string, kind: StructurePage["kind"], title = url): StructurePage => ({ url, title, kind, depth: 1, urlDepth: 1, inlinks: 5, inContentInlinks: 2, outlinks: 3, nofollowInlinks: 0, importance: 50 });

const absent: SheetLlmsTxt = { url: "https://ex.test/llms.txt", present: false, status: 404, length: 0, bytes: 0, title: null, summary: null, sections: [], linkCount: 0, describedLinks: 0, checks: [], full: { present: false, length: 0 } };

const site = {
  topPages: [page("https://ex.test/", "home"), page("https://ex.test/service", "service", "サービス"), page("https://ex.test/company", "company", "会社概要"), page("https://ex.test/contact", "contact", "お問い合わせ")],
  kinds: [
    { kind: "home" as const, count: 1 },
    { kind: "service" as const, count: 3 },
    { kind: "company" as const, count: 1 },
    { kind: "contact" as const, count: 1 },
  ],
  pageCount: 6,
};

describe("llms.txt が無いとき", () => {
  it("骨組み・サイトにある種別のセクション・候補ページ・置き場所を出す", () => {
    const items = llmsAdvice(absent, site);
    const titles = items.map((i) => i.title);
    expect(titles[0]).toContain("# サイト名");
    expect(titles.some((t) => t.includes("## サービス・商品"))).toBe(true);
    expect(titles.some((t) => t.includes("## 会社・店舗情報"))).toBe(true);
    expect(titles.some((t) => t.includes("## お問い合わせ"))).toBe(true);
    // サイトに無い種別（採用）は勧めない
    expect(titles.some((t) => t.includes("## 採用"))).toBe(false);
    const svc = items.find((i) => i.title.includes("サービス・商品"))!;
    expect(svc.pages?.map((p) => p.url)).toEqual(["https://ex.test/service"]);
    const cand = items.find((i) => i.title.includes("候補"))!;
    expect(cand.pages?.map((p) => p.url)).toEqual(["https://ex.test/service", "https://ex.test/company", "https://ex.test/contact"]);
    expect(titles[titles.length - 1]).toContain("置き場所");
  });

  it("ページ数が多ければ llms-full.txt も勧める", () => {
    expect(llmsAdvice(absent, { ...site, pageCount: 40 }).some((i) => i.title.includes("llms-full.txt"))).toBe(true);
    expect(llmsAdvice(absent, site).some((i) => i.title.includes("llms-full.txt"))).toBe(false);
  });
});

describe("llms.txt があるとき", () => {
  const present: SheetLlmsTxt = {
    ...absent,
    present: true,
    status: 200,
    length: 800,
    bytes: 1200,
    title: "Example",
    summary: "概要",
    sections: ["サービス", "会社概要"],
    linkCount: 4,
    describedLinks: 1,
    checks: [
      { id: "exists", label: "ファイルの有無", level: "pass", detail: "" },
      { id: "title", label: "サイト名（# 見出し）", level: "pass", detail: "" },
      { id: "descriptions", label: "リンクの説明", level: "warn", detail: "1 / 4 件に説明が付いています" },
    ],
  };

  it("既にある見出しのセクションは勧めず、無い種別と検証で落ちた項目だけ出す", () => {
    const items = llmsAdvice(present, site);
    const titles = items.map((i) => i.title);
    expect(titles.some((t) => t.includes("## サービス・商品"))).toBe(false);
    expect(titles.some((t) => t.includes("## 会社・店舗情報"))).toBe(false);
    expect(titles.some((t) => t.includes("## お問い合わせ"))).toBe(true);
    expect(titles.some((t) => t.includes("リンクの説明を直す"))).toBe(true);
    expect(titles.some((t) => t.includes("# サイト名"))).toBe(false);
    expect(titles.some((t) => t.includes("置き場所"))).toBe(false);
  });

  it("何も足りなければ空", () => {
    const full = { ...present, sections: ["サービス", "会社概要", "お問い合わせ"], checks: present.checks.filter((c) => c.level === "pass") };
    expect(llmsAdvice(full, site)).toEqual([]);
  });
});
