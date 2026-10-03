import { describe, expect, it } from "vitest";
import { buildActionPlan, firstActionOf, LEVEL_LABELS, type ActionItem } from "../action-plan";

function item(id: string, urgency: ActionItem["urgency"], gain = 3, advice?: string): ActionItem {
  return { id, label: `${id} のラベル`, categoryLabel: "メタ情報", gainLabel: `+${gain} 点`, urgency, advice };
}

describe("まず、これをしてください（buildActionPlan）", () => {
  it("急ぎがあれば、件数と「まず下の 1 件から」を伝え、最初の 1 件は急ぎの項目になる", () => {
    const plan = buildActionPlan({
      items: [item("jsonld-exists", "soon", 6, "JSON-LD を置く"), item("noindex", "now", 1, "noindex を外す"), item("llms-txt", "later", 1)],
      overall: 58,
      grade: "D",
      subject: "このページ",
    });
    expect(plan.verdict).toBe("このページの総合 58 点は低めの水準です。急ぎで直す項目が 1 件あります。ほかの 2 件より先に、まず下の 1 件から手をつけてください。");
    expect(plan.first?.id).toBe("noindex");
    expect(plan.first?.advice).toBe("noindex を外す");
    expect(plan.tiers.map((t) => [t.urgency, t.count])).toEqual([
      ["now", 1],
      ["soon", 1],
      ["later", 1],
    ]);
    expect(plan.total).toBe(3);
  });

  it("急ぎが無ければ要改善を効果順に、放置 OK の件数も添える", () => {
    const plan = buildActionPlan({
      items: [item("description", "soon", 6), item("ogp", "soon", 2), item("llms-txt", "later", 1)],
      overall: 82,
      grade: "B",
      subject: "このサイト",
    });
    expect(plan.verdict).toContain("良い水準");
    expect(plan.verdict).toContain("急ぎで直す項目はありません。要改善 2 件を効果の大きい順に進めれば十分です（残り 1 件は一旦放置で問題ありません）。");
    // 同じ優先度なら元の並び（見込み効果の降順）の先頭
    expect(plan.first?.id).toBe("description");
  });

  it("放置 OK だけなら、そう言い切る", () => {
    const plan = buildActionPlan({ items: [item("llms-txt", "later", 1)], overall: 95, grade: "A", subject: "このページ" });
    expect(plan.verdict).toBe("このページの総合 95 点は高い水準です。急ぎで直す項目はありません。残る 1 件は点数への影響が小さく、一旦放置で問題ありません。");
    expect(plan.first?.id).toBe("llms-txt");
  });

  it("改善点が無ければ first は null で、対応不要と伝える", () => {
    const plan = buildActionPlan({ items: [], overall: 100, grade: "A", subject: "このページ" });
    expect(plan.first).toBeNull();
    expect(plan.total).toBe(0);
    expect(plan.verdict).toContain("いま急いで直すものはありません");
  });

  it("点数が未測定（MEO）のときは水準の文を省く", () => {
    const plan = buildActionPlan({ items: [item("phone", "now")], overall: null, grade: null, subject: "このプロフィール" });
    expect(plan.verdict.startsWith("急ぎで直す項目が 1 件あります")).toBe(true);
  });

  it("「危険」「致命的」などの断定語を使わない", () => {
    for (const label of Object.values(LEVEL_LABELS)) {
      expect(label).not.toMatch(/危険|致命/);
    }
  });

  it("intro は水準の文の前に付き、effectHeading は既定「見込み効果」で差し替えられる", () => {
    const plan = buildActionPlan({ items: [item("x", "soon")], overall: null, grade: null, subject: "このサイト", intro: "10 ページを診断しました。", effectHeading: "該当" });
    expect(plan.verdict.startsWith("10 ページを診断しました。急ぎで直す項目はありません。")).toBe(true);
    expect(plan.effectHeading).toBe("該当");
    expect(buildActionPlan({ items: [], overall: 90, grade: "A", subject: "このページ" }).effectHeading).toBe("見込み効果");
  });

  it("firstActionOf は空なら null", () => {
    expect(firstActionOf([])).toBeNull();
  });
});
