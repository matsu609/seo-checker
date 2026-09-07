import { describe, expect, it } from "vitest";
import { bigrams, matchTopic, mergeLabels, normalizeLabel, similarity, upsertTopic, type TopicEntry } from "../normalize";

function entry(id: string, label: string, aliases: string[] = []): TopicEntry {
  return { id, keyword: "AIO 対策", label, aliases, firstSeen: "2026-09-01" };
}

describe("normalizeLabel", () => {
  it("全角半角・大文字小文字・記号・空白を吸収する", () => {
    expect(normalizeLabel("ＡＩ Ｏｖｅｒｖｉｅｗｓ の 仕組み")).toBe("aioverviewsの仕組み");
    expect(normalizeLabel("コンテンツの主な特徴・例")).toBe("コンテンツの主な特徴例");
    expect(normalizeLabel("  llms.txt とは  ")).toBe("llmstxt");
  });

  it("語尾の「について」「とは」を落とす", () => {
    expect(normalizeLabel("企業における活用例について")).toBe(normalizeLabel("企業における活用例"));
    expect(normalizeLabel("構造化データとは")).toBe("構造化データ");
  });

  it("記号だけのラベルは空にならない", () => {
    expect(normalizeLabel("---")).toBe("");
    expect(normalizeLabel("とは")).toBe("とは");
  });
});

describe("similarity", () => {
  it("正規形が同じなら 1", () => {
    expect(similarity("AI Overviews の仕組み", "ＡＩ　Ｏｖｅｒｖｉｅｗｓの仕組み")).toBe(1);
  });

  it("似ているほど 1 に近づく", () => {
    expect(similarity("企業における活用例", "企業における活用事例")).toBeGreaterThan(0.8);
    expect(similarity("企業における活用例", "企業での活用例")).toBeGreaterThan(0.4);
    expect(similarity("企業における活用例", "料金プランの比較")).toBeLessThan(0.2);
  });

  it("空文字は 0", () => {
    expect(similarity("", "活用例")).toBe(0);
  });

  it("bigrams は 1 文字でも落ちない", () => {
    expect(bigrams("あ")).toEqual(["あ"]);
    expect(bigrams("")).toEqual([]);
    expect(bigrams("あいう")).toEqual(["あい", "いう"]);
  });
});

describe("matchTopic", () => {
  const entries = [entry("t1", "コンテンツの主な特徴と例"), entry("t2", "企業における活用例", ["企業での活用事例"])];

  it("別表記でも同じトピックに寄る", () => {
    expect(matchTopic(entries, "企業での活用事例")?.entry.id).toBe("t2");
    expect(matchTopic(entries, "ＣＯＮＴＥＮＴＳ")).toBeNull();
  });

  it("しきい値未満なら新規扱い（null）", () => {
    expect(matchTopic(entries, "料金プランの比較")).toBeNull();
    expect(matchTopic(entries, "コンテンツの主な特徴と例（画像）", 0.99)).toBeNull();
  });

  it("空ラベルは null", () => {
    expect(matchTopic(entries, "   ")).toBeNull();
  });
});

describe("upsertTopic", () => {
  it("既存に寄せたときは別表記として記録する", () => {
    const before = [entry("t1", "企業における活用例")];
    const result = upsertTopic(before, { keyword: "AIO 対策", label: "企業における活用例。", firstSeen: "2026-09-02" });
    expect(result.created).toBe(false);
    expect(result.entry.id).toBe("t1");
    // 正規形が同じなので別表記は増えない
    expect(result.entries[0].aliases).toEqual([]);

    const merged = upsertTopic(before, { keyword: "AIO 対策", label: "企業における活用事例", firstSeen: "2026-09-02" });
    expect(merged.created).toBe(false);
    expect(merged.entries[0].aliases).toEqual(["企業における活用事例"]);
  });

  it("別キーワードの辞書とは混ざらない", () => {
    const before = [entry("t1", "企業における活用例")];
    const result = upsertTopic(before, { keyword: "LLMO とは", label: "企業における活用例", firstSeen: "2026-09-02" });
    expect(result.created).toBe(true);
    expect(result.entries).toHaveLength(2);
  });

  it("新規は firstSeen を持つ", () => {
    const result = upsertTopic([], { keyword: "AIO 対策", label: "料金の目安", firstSeen: "2026-09-02" });
    expect(result.entry).toMatchObject({ label: "料金の目安", firstSeen: "2026-09-02", aliases: [] });
  });
});

describe("mergeLabels", () => {
  it("1 日分をまとめて取り込み、同じトピックに寄ったものは 1 件にする", () => {
    const { entries, mapping } = mergeLabels([], {
      keyword: "AIO 対策",
      labels: ["構造化データの追加", "構造化データの追加。", "  ", "llms.txt の設置"],
      firstSeen: "2026-09-01",
    });
    expect(entries).toHaveLength(2);
    expect(mapping).toHaveLength(2);
    expect(mapping[0].created).toBe(true);

    const second = mergeLabels(entries, {
      keyword: "AIO 対策",
      labels: ["構造化データの追加", "料金の目安"],
      firstSeen: "2026-09-02",
    });
    expect(second.entries).toHaveLength(3);
    expect(second.mapping[0].topicId).toBe(mapping[0].topicId);
    expect(second.mapping[1].created).toBe(true);
  });
});
