import { describe, expect, it } from "vitest";
import type { Issue } from "@/lib/audit/types";
import { buildAnalysisActionPlan, recommendationItems, recommendationUrgency } from "../action-plan";
import type { Recommendation } from "../ai/schema";

function rec(priority: number, title: string): Recommendation {
  return { priority, title, what: `${title}をこう変える`, why: "理由", expected: "問い合わせが増える見込み", effort: "low", factIds: ["S-01"], before: null, after: null };
}
const issue: Issue = { ruleId: "TITLE_MISSING", category: "タイトルタグ", severity: "error", url: "https://example.test/", detail: "<title> がない", suggestion: "title を書く" };

describe("精密診断の「まず、これをしてください」", () => {
  it("AI の優先度 1 / 2 / 3 を 急ぎ / 要改善 / 放置 OK に読み替える（範囲外は丸める）", () => {
    expect(recommendationUrgency(1)).toBe("now");
    expect(recommendationUrgency(2)).toBe("soon");
    expect(recommendationUrgency(3)).toBe("later");
    expect(recommendationUrgency(0)).toBe("now");
    expect(recommendationUrgency(9)).toBe("later");
    expect(recommendationUrgency(Number.NaN)).toBe("later");
  });

  it("アドバイスがあればそれを使い、priority の昇順で最初の 1 件を選ぶ。対応方法は what、効果は expected", () => {
    const plan = buildAnalysisActionPlan({
      analyzedPages: 20,
      quickScore: 72,
      recommendations: [rec(2, "説明文を書き分ける"), rec(1, "トップの title に地域名を入れる"), rec(3, "llms.txt を置く")],
      issues: [issue],
    });
    expect(plan).not.toBeNull();
    expect(plan!.verdict).toBe("20 ページを診断し、専門家のアドバイスは 3 件です。トップページの総合 72 点は平均的な水準です。急ぎで直す項目が 1 件あります。ほかの 2 件より先に、まず下の 1 件から手をつけてください。");
    expect(plan!.first?.label).toBe("トップの title に地域名を入れる");
    expect(plan!.first?.advice).toBe("トップの title に地域名を入れるをこう変える");
    expect(plan!.first?.gainLabel).toBe("問い合わせが増える見込み");
    expect(plan!.effectHeading).toBe("期待できること");
    expect(recommendationItems([rec(3, "a"), rec(1, "b")]).map((i) => i.label)).toEqual(["b", "a"]);
  });

  it("アドバイスが無ければサイト診断の 50 ルールから組み立てる", () => {
    const plan = buildAnalysisActionPlan({ analyzedPages: 5, quickScore: null, recommendations: null, issues: [issue] });
    expect(plan?.first?.id).toBe("TITLE_MISSING");
    expect(plan?.first?.urgency).toBe("now");
    expect(plan?.effectHeading).toBe("該当");
  });

  it("どちらも無ければ null（古い保存分）", () => {
    expect(buildAnalysisActionPlan({ analyzedPages: 5, quickScore: 80, recommendations: [], issues: null })).toBeNull();
  });
});
