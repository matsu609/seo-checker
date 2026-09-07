import { describe, expect, it } from "vitest";
import { classifyByRule, classifyIntents, intentDistribution, type IntentClassifier } from "../intent";
import type { SearchIntent } from "../types";

function intentOf(keyword: string, brands: string[] = []): SearchIntent | null {
  return classifyByRule(keyword, brands)?.intent ?? null;
}

describe("classifyByRule", () => {
  it("情報収集: とは / 方法 / やり方", () => {
    expect(intentOf("llmo とは")).toBe("informational");
    expect(intentOf("被リンク 増やす 方法")).toBe("informational");
    expect(intentOf("canonical 設定 やり方")).toBe("informational");
    expect(intentOf("インデックス されない 原因")).toBe("informational");
  });

  it("取引: 購入 / 料金 / 申込", () => {
    expect(intentOf("seo ツール 購入")).toBe("transactional");
    expect(intentOf("seo コンサル 料金")).toBe("transactional");
    expect(intentOf("無料体験 申し込み")).toBe("transactional");
  });

  it("商業調査: 比較 / おすすめ / ランキング", () => {
    expect(intentOf("seo ツール 比較")).toBe("commercial");
    expect(intentOf("llmo ツール おすすめ")).toBe("commercial");
    expect(intentOf("seo 会社 ランキング")).toBe("commercial");
    expect(intentOf("mieruca 評判")).toBe("commercial");
  });

  it("サイト誘導: 公式 / ログイン", () => {
    expect(intentOf("search console ログイン")).toBe("navigational");
    expect(intentOf("アナリティクス 公式")).toBe("navigational");
  });

  it("ブランド語を含み他のルールに当たらないものはサイト誘導", () => {
    expect(intentOf("mieruca", ["mieruca"])).toBe("navigational");
    expect(intentOf("MIERUCA 管理画面", ["mieruca"])).toBe("navigational");
    // 1 文字のブランド語は誤爆するので採用しない
    expect(intentOf("あ いろは", ["あ"])).toBeNull();
  });

  it("語尾で意図を言い切っているキーワードは語尾を優先する（§8.3）", () => {
    // 「アクセス」（サイト誘導）より語尾の「とは」を優先する
    expect(intentOf("アクセス解析とは")).toBe("informational");
    expect(intentOf("アクセス解析 とは")).toBe("informational");
    // 「価格」「求人」「転職」（取引）より語尾の「とは」を優先する
    expect(intentOf("価格とは")).toBe("informational");
    expect(intentOf("求人 とは")).toBe("informational");
    expect(intentOf("転職とは")).toBe("informational");
    // 「アクセス」「店舗」（サイト誘導）より語尾の「方法」を優先する
    expect(intentOf("アクセス 方法")).toBe("informational");
    expect(intentOf("店舗 開業 方法")).toBe("informational");
    // ただし取引の語が入っていれば取引のまま（購買に近い意図を優先）
    expect(intentOf("購入方法")).toBe("transactional");
    expect(intentOf("料金 確認 方法")).toBe("transactional");
  });

  it("あいまいなケース: より購買に近い意図を優先する", () => {
    // 「購入」+「方法」→ 取引（情報収集より優先）
    expect(intentOf("seo ツール 購入 方法")).toBe("transactional");
    // 「料金」+「比較」→ 商業調査（取引より優先）
    expect(intentOf("seo ツール 料金 比較")).toBe("commercial");
    // ブランド語 +「比較」→ 商業調査（サイト誘導にしない）
    expect(intentOf("mieruca 比較", ["mieruca"])).toBe("commercial");
    // ブランド語 +「ログイン」→ サイト誘導
    expect(intentOf("mieruca ログイン", ["mieruca"])).toBe("navigational");
  });

  it("どのルールにも当たらなければ null（LLM 送り）", () => {
    expect(intentOf("llmo 事例 2026")).not.toBeNull(); // 事例 = 情報収集
    expect(intentOf("生成 ai 検索")).toBeNull();
    expect(intentOf("")).toBeNull();
  });

  it("一致した語を根拠として返す", () => {
    expect(classifyByRule("seo ツール 比較")?.matched).toBe("比較");
  });
});

describe("classifyIntents", () => {
  const keywords = ["llmo とは", "生成 ai 検索", "seo ツール 比較", "aio 最適化"];

  it("分類器が無ければルールの分だけ付き、残りは未分類", async () => {
    const result = await classifyIntents({ keywords, classifier: null });
    expect(result.ruleCount).toBe(2);
    expect(result.llmCount).toBe(0);
    expect(result.unknownCount).toBe(2);
    expect(result.items.find((i) => i.keyword === "生成 ai 検索")?.judge).toBe("unknown");
    expect(result.llmError).toBeNull();
  });

  it("残りだけを分類器に渡し、結果をマージする", async () => {
    let received: readonly string[] = [];
    const classifier: IntentClassifier = async (list) => {
      received = list;
      return new Map(list.map((k) => [k, "informational" as const]));
    };
    const result = await classifyIntents({ keywords, classifier });
    expect(received).toEqual(["生成 ai 検索", "aio 最適化"]);
    expect(result.ruleCount).toBe(2);
    expect(result.llmCount).toBe(2);
    expect(result.unknownCount).toBe(0);
    expect(result.items.find((i) => i.keyword === "aio 最適化")?.judge).toBe("llm");
  });

  it("分類器が落ちても調査結果は返し、理由を残す", async () => {
    const classifier: IntentClassifier = async () => {
      throw new Error("rate limit");
    };
    const result = await classifyIntents({ keywords, classifier });
    expect(result.llmError).toBe("rate limit");
    expect(result.unknownCount).toBe(2);
    expect(result.ruleCount).toBe(2);
  });

  it("分類器がルール済みの語を返しても上書きしない", async () => {
    const classifier: IntentClassifier = async () =>
      new Map<string, SearchIntent>([["llmo とは", "transactional"]]);
    const result = await classifyIntents({ keywords: ["llmo とは"], classifier });
    expect(result.items[0].intent).toBe("informational");
    expect(result.items[0].judge).toBe("rule");
  });
});

describe("intentDistribution", () => {
  it("未分類も 1 区分として数える", () => {
    const d = intentDistribution([
      { intent: "informational" },
      { intent: "informational" },
      { intent: "commercial" },
      { intent: null },
    ]);
    expect(d).toEqual({
      informational: 2,
      commercial: 1,
      transactional: 0,
      navigational: 0,
      unknown: 1,
    });
  });
});
