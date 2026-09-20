/**
 * robots.txt の書式チェック。
 *
 * ここで見るのは「書いたのに効いていない行」だけで、可否の判定（どのクローラが
 * どの URL を取れるか）は robots.test.ts / analyzer.test.ts の役目。
 */
import { describe, expect, it } from "vitest";
import { countBySeverity, lintRobotsTxt } from "../robots-syntax";

const messages = (text: string) => lintRobotsTxt(text).map((i) => i.message);
const severities = (text: string) => lintRobotsTxt(text).map((i) => i.severity);

describe("lintRobotsTxt", () => {
  it("ふつうの robots.txt には何も言わない", () => {
    const text = [
      "# サイト全体を許可",
      "User-agent: *",
      "Allow: /",
      "Disallow: /admin/",
      "",
      "Sitemap: https://example.com/sitemap.xml",
    ].join("\n");
    expect(lintRobotsTxt(text)).toEqual([]);
  });

  it("ディレクティブの綴り間違いを行番号つきで指摘する", () => {
    const issues = lintRobotsTxt("User-agent: *\nDissallow: /admin/\n");
    expect(issues).toHaveLength(1);
    expect(issues[0].line).toBe(2);
    expect(issues[0].severity).toBe("error");
    expect(issues[0].message).toContain("disallow");
  });

  it("まったく知らない名前は warn（別の何かを書いている可能性がある）", () => {
    expect(severities("User-agent: *\nX-Robots-Tag: noindex\n")).toEqual(["warn"]);
  });

  it("User-agent より前の Disallow は効かないので error", () => {
    const issues = lintRobotsTxt("Disallow: /admin/\nUser-agent: *\n");
    expect(issues).toHaveLength(1);
    expect(issues[0].line).toBe(1);
    expect(issues[0].message).toContain("どのクローラにも適用されない");
  });

  it("全角の空白・全角コロンが入った行を指摘する", () => {
    expect(messages("User-agent:　*\n")[0]).toContain("全角");
    expect(messages("User-agent： *\n")[0]).toContain("全角");
  });

  it("「名前: 値」の形になっていない行を指摘する", () => {
    expect(messages("User agent *\n")[0]).toContain("ディレクティブ: 値");
  });

  it("Disallow に絶対 URL を書くと効かない", () => {
    expect(messages("User-agent: *\nDisallow: https://example.com/admin/\n")[0]).toContain(
      "絶対 URL ではなくパス",
    );
  });

  it("Disallow の値が / で始まらない行を指摘する", () => {
    expect(messages("User-agent: *\nDisallow: admin\n")[0]).toContain("「/」で始めます");
  });

  it("Disallow:（空）は「すべて許可」の正しい書き方なので指摘しない", () => {
    expect(lintRobotsTxt("User-agent: *\nDisallow:\n")).toEqual([]);
  });

  it("CSS / JavaScript のブロックはレンダリングを妨げるので error", () => {
    const issues = lintRobotsTxt("User-agent: *\nDisallow: /*.css$\nDisallow: /assets/app.js\n");
    expect(issues).toHaveLength(2);
    expect(issues[0].message).toContain("描画");
  });

  it("Sitemap は絶対 URL でないと読まれない", () => {
    expect(messages("Sitemap: /sitemap.xml\n")[0]).toContain("絶対 URL");
    expect(lintRobotsTxt("Sitemap: https://example.com/sitemap.xml\n")).toEqual([]);
  });

  it("robots.txt の noindex は効かない（2019 年に Google が対応をやめた）", () => {
    const issues = lintRobotsTxt("User-agent: *\nNoindex: /secret/\n");
    expect(issues[0].severity).toBe("warn");
    expect(issues[0].message).toContain("meta robots");
  });

  it("Crawl-delay は害がないので info（採点には響かせない）", () => {
    expect(severities("User-agent: *\nCrawl-delay: 10\n")).toEqual(["info"]);
  });

  it("BOM は 1 行目を読み飛ばさせるので error", () => {
    expect(messages("﻿User-agent: *\nAllow: /\n")[0]).toContain("BOM");
  });

  it("User-agent の値が空なら error", () => {
    expect(messages("User-agent:\nDisallow: /\n")[0]).toContain("User-agent の値が空");
  });

  it("500KB を超えると Google が読み切らないので warn", () => {
    const text = `User-agent: *\n${"# 長いコメント\n".repeat(60_000)}`;
    const issues = lintRobotsTxt(text);
    expect(issues.some((i) => i.severity === "warn" && i.message.includes("500KB"))).toBe(true);
  });

  it("コメントの中身は判定しない", () => {
    expect(lintRobotsTxt("User-agent: *\n# Dissallow: /admin/ は書き間違い\nAllow: /\n")).toEqual([]);
  });

  it("countBySeverity が重大度ごとに数える", () => {
    const counts = countBySeverity(
      lintRobotsTxt("User-agent: *\nDissallow: /a\nCrawl-delay: 5\nNoindex: /b\n"),
    );
    expect(counts).toEqual({ error: 1, warn: 1, info: 1 });
  });
});
