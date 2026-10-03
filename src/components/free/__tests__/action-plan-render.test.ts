import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildActionPlan } from "@/lib/report/action-plan";
import { ActionPlanBlock } from "../ActionPlan";

describe("ActionPlanBlock の描画", () => {
  it("見出し・1 文・最初の 1 件・3 段の件数・注記を描く", () => {
    const plan = buildActionPlan({
      items: [
        { id: "noindex", label: "noindex が付いている", categoryLabel: "AI・検索クローラ可否", gainLabel: "+3 点", urgency: "now", advice: "noindex を外す" },
        { id: "llms-txt", label: "llms.txt が無い", categoryLabel: "AI・検索クローラ可否", gainLabel: "+2 点", urgency: "later" },
      ],
      overall: 58,
      grade: "D",
      subject: "このページ",
    });
    const html = renderToStaticMarkup(createElement(ActionPlanBlock, { plan, note: "注記のテスト" }));
    expect(html).toContain("まず、これをしてください");
    expect(html).toContain("このページの総合 58 点は低めの水準です。");
    expect(html).toContain("noindex が付いている");
    expect(html).toContain("noindex を外す");
    expect(html).toContain("見込み効果 +3 点");
    expect(html).toContain("今すぐ対応");
    expect(html).toContain("後回しで OK");
    expect(html).toContain("注記のテスト");
  });

  it("改善点が無ければ帯を描かず、効果の見出しは差し替えられる", () => {
    const plan = buildActionPlan({ items: [], overall: null, grade: null, subject: "このサイト", intro: "3 ページを診断しました。", effectHeading: "該当" });
    const html = renderToStaticMarkup(createElement(ActionPlanBlock, { plan }));
    expect(html).toContain("3 ページを診断しました。");
    expect(html).not.toContain("改善点の優先度の内訳");
  });
});
