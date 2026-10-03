import { describe, expect, it } from "vitest";
import type { Issue } from "../types";
import { AUDIT_BLOCKING, auditUrgency, buildAuditActionItems, buildAuditActionPlan } from "../urgency";

function issue(ruleId: string, severity: Issue["severity"], url = "https://example.test/", detail = `${ruleId} の内容`): Issue {
  return { ruleId, category: "基本的な設定", severity, url, detail, suggestion: `${ruleId} の直し方` };
}

describe("サイト診断の対応の優先度（auditUrgency）", () => {
  it("載らない・読まれない原因のルールは急ぎ、意図した除外（info）は放置 OK", () => {
    expect(auditUrgency("NOINDEX", "warning")).toBe("now");
    expect(auditUrgency("NOINDEX", "info")).toBe("later");
    expect(auditUrgency("STATUS_5XX", "error")).toBe("now");
    expect(auditUrgency("ROBOTS_BLOCKED", "error")).toBe("now");
    expect(auditUrgency("AI_CRAWLER_BLOCKED", "warning")).toBe("now");
    expect(auditUrgency("TITLE_MISSING", "error")).toBe("now");
  });

  it("それ以外は 重大 / 警告 = 要改善、情報 = 放置 OK", () => {
    expect(auditUrgency("TITLE_DUPLICATE", "error")).toBe("soon");
    expect(auditUrgency("META_DESC_SHORT", "warning")).toBe("soon");
    expect(auditUrgency("LLMS_TXT_MISSING", "info")).toBe("later");
    expect(auditUrgency("UNKNOWN_RULE", "warning")).toBe("soon");
  });

  it("急ぎの一覧は実在するルール ID だけ", () => {
    for (const id of AUDIT_BLOCKING) expect(id).toMatch(/^[A-Z0-9_]+$/);
    expect(AUDIT_BLOCKING.size).toBeGreaterThan(5);
  });
});

describe("サイト診断の「まず、これをしてください」", () => {
  const issues = [
    issue("META_DESC_SHORT", "warning", "https://example.test/a"),
    issue("META_DESC_SHORT", "warning", "https://example.test/b"),
    issue("META_DESC_SHORT", "warning", "https://example.test/c"),
    issue("TITLE_DUPLICATE", "error", "https://example.test/a"),
    issue("TITLE_DUPLICATE", "error", "https://example.test/b"),
    issue("NOINDEX", "info", "https://example.test/search"),
    issue("NOINDEX", "warning", "https://example.test/about"),
    issue("LLMS_TXT_MISSING", "info"),
  ];

  it("ルールごとに 1 件にまとめ、急ぎ → 要改善（重大 → 警告・件数順）→ 放置 OK の順に並ぶ", () => {
    const items = buildAuditActionItems(issues);
    expect(items.map((i) => [i.ruleId, i.urgency, i.count])).toEqual([
      ["NOINDEX", "now", 2],
      ["TITLE_DUPLICATE", "soon", 2],
      ["META_DESC_SHORT", "soon", 3],
      ["LLMS_TXT_MISSING", "later", 1],
    ]);
    // 同じルールで重要度が混ざるときは重いほうを採り、その課題の文を使う
    const noindex = items[0];
    expect(noindex.severity).toBe("warning");
    expect(noindex.label).toBe("NOINDEX の内容");
    expect(noindex.advice).toBe("NOINDEX の直し方");
    expect(noindex.gainLabel).toBe("2 件");
    expect(noindex.categoryLabel).toBe("基本的な設定・警告");
  });

  it("先頭ブロックは診断の規模を 1 文で添え、最初の 1 件は急ぎの項目、効果の見出しは「該当」", () => {
    const plan = buildAuditActionPlan({ issues, analyzedPages: 12 });
    expect(plan.verdict).toBe("12 ページを診断し、課題は 8 件（4 種類）でした。急ぎで直す項目が 1 件あります。ほかの 3 件より先に、まず下の 1 件から手をつけてください。");
    expect(plan.first?.id).toBe("NOINDEX");
    expect(plan.effectHeading).toBe("該当");
    expect(plan.tiers.map((t) => t.count)).toEqual([1, 2, 1]);
  });

  it("課題が無ければ対応不要と伝える", () => {
    const plan = buildAuditActionPlan({ issues: [], analyzedPages: 3 });
    expect(plan.first).toBeNull();
    expect(plan.verdict).toContain("いま急いで直すものはありません");
  });
});
