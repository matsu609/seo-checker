/**
 * ブラウザ側ストア（localStorage + zod）。node 環境なので localStorage は差し替える。
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  promptExpansionsStore,
  removeExpansion,
  parseSeedText,
  saveExpansion,
  MAX_EXPANSIONS,
} from "../expansion/store";
import type { ExpansionResult } from "../expansion/types";
import {
  addPrompts,
  addResearch,
  clearMonitorRuns,
  defaultResearchName,
  llmoPromptsStore,
  llmoResearchStore,
  llmoRunsStore,
  MAX_RUNS,
  MAX_STORED_ANSWER,
  monitorRuns,
  promptsForProject,
  removePrompt,
  removeResearch,
  researchRuns,
  saveRuns,
  toStoredRun,
  togglePrompt,
} from "../store";
import type { LlmoRun, LlmoRunRow } from "../types";

/** node 環境用の localStorage もどき（src/lib/store/__tests__ と同じ手当て） */
class FakeStorage implements Storage {
  private map = new Map<string, string>();
  get length() {
    return this.map.size;
  }
  clear() {
    this.map.clear();
  }
  getItem(key: string) {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }
  key(index: number) {
    return Array.from(this.map.keys())[index] ?? null;
  }
  removeItem(key: string) {
    this.map.delete(key);
  }
  setItem(key: string, value: string) {
    this.map.set(key, String(value));
  }
}

const g = globalThis as unknown as { localStorage?: Storage };

beforeEach(() => {
  g.localStorage = new FakeStorage();
  llmoPromptsStore.reset();
  llmoRunsStore.reset();
  llmoResearchStore.reset();
  promptExpansionsStore.reset();
});

afterEach(() => {
  delete g.localStorage;
});

function row(overrides: Partial<LlmoRunRow> = {}): LlmoRunRow {
  return {
    promptId: "p1",
    promptText: "一つ目",
    providerId: "claude",
    model: "claude-opus-5",
    status: "ok",
    answer: "回答",
    citations: [],
    searchQueries: [],
    fanoutSupported: true,
    judgements: [],
    unclassified: [],
    ...overrides,
  };
}

function stored(overrides: Partial<LlmoRunRow> = {}, meta: Partial<Parameters<typeof toStoredRun>[1]> = {}): LlmoRun {
  return toStoredRun(row(overrides), {
    projectId: "proj",
    takenOn: "2026-09-03",
    measuredAt: "2026-09-03T09:00:00.000Z",
    ...meta,
  });
}

describe("プロンプトの登録", () => {
  it("同じ本文は 2 度登録しない", () => {
    const first = addPrompts(["A の質問", "B の質問"], { projectId: "proj" });
    expect(first).toHaveLength(2);
    const second = addPrompts([" A の質問 ", "C の質問"], { projectId: "proj" });
    expect(second.map((p) => p.text)).toEqual(["C の質問"]);
    expect(promptsForProject(llmoPromptsStore.get(), "proj")).toHaveLength(3);
  });

  it("プロジェクトが違えば同じ本文でも登録できる", () => {
    addPrompts(["A の質問"], { projectId: "proj" });
    expect(addPrompts(["A の質問"], { projectId: "other" })).toHaveLength(1);
  });

  it("カテゴリを付けて登録できる（プロンプト拡張からの登録）", () => {
    const [created] = addPrompts(["費用の相場は？"], { projectId: "proj", category: "費用・料金" });
    expect(created.category).toBe("費用・料金");
    expect(created.active).toBe(true);
  });

  it("対象の ON / OFF と削除ができる", () => {
    const [created] = addPrompts(["A の質問"], { projectId: "proj" });
    togglePrompt(created.id, false);
    expect(llmoPromptsStore.get()[0].active).toBe(false);
    removePrompt(created.id);
    expect(llmoPromptsStore.get()).toHaveLength(0);
  });
});

describe("実行結果の保存", () => {
  it("同じ日・同じプロンプト・同じモデルは後勝ちで置き換える", () => {
    saveRuns([stored({ answer: "1 回目" })]);
    saveRuns([stored({ answer: "2 回目" })]);
    const runs = llmoRunsStore.get();
    expect(runs).toHaveLength(1);
    expect(runs[0].answer).toBe("2 回目");
  });

  it("日付・モデルが違えば別の行として貯まる", () => {
    saveRuns([stored()]);
    saveRuns([stored({ providerId: "openai" })]);
    saveRuns([stored({}, { takenOn: "2026-09-04" })]);
    expect(llmoRunsStore.get()).toHaveLength(3);
  });

  it("リサーチの結果は置き換えず、researchId で取り出せる", () => {
    saveRuns([stored({}, { researchId: "r1" })]);
    saveRuns([stored({}, { researchId: "r1" })]);
    const runs = llmoRunsStore.get();
    expect(runs).toHaveLength(2);
    expect(researchRuns(runs, "r1")).toHaveLength(2);
    expect(monitorRuns(runs, "proj")).toHaveLength(0);
  });

  it("回答本文は保存時に切り詰める", () => {
    saveRuns([stored({ answer: "あ".repeat(MAX_STORED_ANSWER + 100) })]);
    expect(llmoRunsStore.get()[0].answer).toHaveLength(MAX_STORED_ANSWER);
  });

  it("上限を超えたら古い行から捨てる", () => {
    const many = Array.from({ length: MAX_RUNS + 5 }, (_, i) =>
      stored({ promptId: `p${i}` }, { takenOn: "2026-09-03" }),
    );
    saveRuns(many);
    const runs = llmoRunsStore.get();
    expect(runs).toHaveLength(MAX_RUNS);
    expect(runs[runs.length - 1].promptId).toBe(`p${MAX_RUNS + 4}`);
  });

  it("プロジェクトの定点履歴だけ消せる", () => {
    saveRuns([stored(), stored({}, { researchId: "r1" }), stored({}, { projectId: "other" })]);
    clearMonitorRuns("proj");
    const runs = llmoRunsStore.get();
    expect(runs).toHaveLength(2);
    expect(monitorRuns(runs, "proj")).toHaveLength(0);
  });
});

describe("リサーチ", () => {
  it("既定名は YYYYMMDD LLM リサーチ", () => {
    expect(defaultResearchName(new Date(2026, 8, 6))).toBe("20260906 LLM リサーチ");
  });

  it("削除すると結果も一緒に消える", () => {
    const research = addResearch({
      projectId: "proj",
      name: "テスト",
      promptText: "質問",
      models: ["claude"],
      targetTexts: ["サンプル社"],
      targetSites: ["example.co.jp"],
    });
    saveRuns([stored({}, { researchId: research.id })]);
    expect(llmoResearchStore.get()).toHaveLength(1);
    removeResearch(research.id);
    expect(llmoResearchStore.get()).toHaveLength(0);
    expect(llmoRunsStore.get()).toHaveLength(0);
  });
});

describe("プロンプト拡張のストア", () => {
  function result(total: number): ExpansionResult {
    return {
      seedPrompts: ["A"],
      siteUrl: "https://example.co.jp/",
      site: null,
      siteError: null,
      categories: [{ name: "課題解決", definition: "定義", prompts: [{ text: "質問", chars: 2 }] }],
      total,
      requested: 50,
      model: "claude-opus-5",
      generatedAt: "2026-09-06T00:00:00.000Z",
    };
  }

  it("新しい結果が先頭に来て、上限を超えたら古いものを捨てる", () => {
    for (let i = 0; i < MAX_EXPANSIONS + 3; i += 1) saveExpansion(result(i), "proj");
    const list = promptExpansionsStore.get();
    expect(list).toHaveLength(MAX_EXPANSIONS);
    expect(list[0].result.total).toBe(MAX_EXPANSIONS + 2);
  });

  it("削除できる", () => {
    const saved = saveExpansion(result(1), "proj");
    removeExpansion(saved.id);
    expect(promptExpansionsStore.get()).toHaveLength(0);
  });

  it("参考プロンプトの入力欄は行で分割して重複を除く", () => {
    expect(parseSeedText("A\n B \n\nA\nC")).toEqual(["A", "B", "C"]);
  });
});
