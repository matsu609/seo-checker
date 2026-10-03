import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Issue } from "@/lib/audit/types";
import { AuditIssues, groupByRule } from "../AuditIssues";

const issues: Issue[] = [
  // 意図した除外（情報）が先に来ても、あとの警告で代表させる
  { ruleId: "NOINDEX", category: "基本的な設定", severity: "info", url: "https://example.test/search", detail: "サイト内検索のため、検索結果に出さない指定があります", suggestion: "そのままで構いません" },
  { ruleId: "NOINDEX", category: "基本的な設定", severity: "warning", url: "https://example.test/about", detail: "検索結果に出さない指定があります", suggestion: "noindex を外す" },
  { ruleId: "META_DESC_SHORT", category: "メタタグ", severity: "warning", url: "https://example.test/", detail: "meta description が短い", suggestion: "50 文字以上にする" },
];

describe("課題一覧の優先度", () => {
  it("ルールごとの優先度が付き、画面にピルと「優先度」フィルタが出る", () => {
    const groups = groupByRule(issues);
    expect(groups.map((g) => [g.ruleId, g.urgency])).toEqual([
      ["NOINDEX", "now"],
      ["META_DESC_SHORT", "soon"],
    ]);
    const html = renderToStaticMarkup(createElement(AuditIssues, { issues, origin: "https://example.test", hasPrevious: false }));
    expect(html).toContain("急ぎで対応");
    expect(html).toContain("要改善");
    expect(html).toContain('id="audit-filter-urgency"');
  });
});
