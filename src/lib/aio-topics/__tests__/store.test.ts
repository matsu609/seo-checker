import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AioTopicDay } from "../aggregate";
import {
  aioTopicCoverageStore,
  aioTopicDaysStore,
  aioTopicDictStore,
  applyExtraction,
  coverageMap,
  daysForKeyword,
  MAX_DAYS_PER_KEYWORD,
  mergeDays,
  removeKeywordData,
  saveCoverage,
  saveExtraction,
  storedKeywords,
  topicsForKeyword,
} from "../store";

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
  aioTopicDictStore.reset();
  aioTopicDaysStore.reset();
  aioTopicCoverageStore.reset();
});

afterEach(() => {
  delete g.localStorage;
});

describe("applyExtraction", () => {
  it("ラベルを辞書に取り込み、その日の出現トピックを作る", () => {
    const first = applyExtraction([], {
      keyword: "AIO 対策",
      takenOn: "2026-09-01",
      aioPresent: true,
      selfCited: true,
      topics: [
        { label: "構造化データの追加", evidence: "JSON-LD を追加する" },
        { label: "llms.txt の設置", evidence: "llms.txt を置く" },
      ],
    });
    expect(first.dict).toHaveLength(2);
    expect(first.day.topicIds).toHaveLength(2);
    expect(first.day.evidence?.[first.day.topicIds[0]]).toBe("JSON-LD を追加する");

    // 翌日は表記が揺れても同じトピックに寄る
    const second = applyExtraction(first.dict, {
      keyword: "AIO 対策",
      takenOn: "2026-09-02",
      aioPresent: true,
      selfCited: false,
      topics: [{ label: "構造化データの追加。" }],
    });
    expect(second.dict).toHaveLength(2);
    expect(second.day.topicIds).toEqual([first.day.topicIds[0]]);
  });

  it("AIO が無い日は空のトピックで記録する", () => {
    const result = applyExtraction([], {
      keyword: "AIO 対策",
      takenOn: "2026-09-03",
      aioPresent: false,
      selfCited: false,
      topics: [],
    });
    expect(result.day).toMatchObject({ aioPresent: false, topicIds: [] });
    expect(result.day.evidence).toBeUndefined();
  });
});

describe("ストアの往復", () => {
  it("保存・読み出し・キーワード別の取り出しができる", () => {
    saveExtraction({
      keyword: "AIO 対策",
      takenOn: "2026-09-01",
      aioPresent: true,
      selfCited: true,
      topics: [{ label: "構造化データの追加" }],
    });
    saveExtraction({
      keyword: "LLMO とは",
      takenOn: "2026-09-02",
      aioPresent: true,
      selfCited: false,
      topics: [{ label: "SEO との違い" }],
    });

    expect(aioTopicDaysStore.get()).toHaveLength(2);
    expect(topicsForKeyword(aioTopicDictStore.get(), "AIO 対策")).toHaveLength(1);
    expect(daysForKeyword(aioTopicDaysStore.get(), "LLMO とは")).toHaveLength(1);
    expect(storedKeywords(aioTopicDaysStore.get())).toEqual(["LLMO とは", "AIO 対策"]);
  });

  it("同じキーワード・同じ日は後勝ち", () => {
    saveExtraction({
      keyword: "AIO 対策",
      takenOn: "2026-09-01",
      aioPresent: true,
      selfCited: false,
      topics: [{ label: "構造化データの追加" }],
    });
    saveExtraction({
      keyword: "AIO 対策",
      takenOn: "2026-09-01",
      aioPresent: true,
      selfCited: true,
      topics: [{ label: "構造化データの追加" }, { label: "料金の目安" }],
    });
    const days = daysForKeyword(aioTopicDaysStore.get(), "AIO 対策");
    expect(days).toHaveLength(1);
    expect(days[0].selfCited).toBe(true);
    expect(days[0].topicIds).toHaveLength(2);
  });

  it("上限を超えた日は古い順に捨てる", () => {
    const many: AioTopicDay[] = Array.from({ length: MAX_DAYS_PER_KEYWORD + 3 }, (_, i) => ({
      keyword: "AIO 対策",
      takenOn: `2026-${String(Math.floor(i / 28) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`,
      aioPresent: true,
      selfCited: false,
      topicIds: [],
    }));
    expect(mergeDays([], many)).toHaveLength(MAX_DAYS_PER_KEYWORD);
  });

  it("カバー判定はキーワード・トピック・ページで一意", () => {
    saveCoverage([
      { keyword: "AIO 対策", topicId: "t1", pageUrl: "https://example.com/a", coverage: "none", judgedAt: "2026-09-01T00:00:00.000Z" },
      { keyword: "AIO 対策", topicId: "t1", pageUrl: "https://example.com/a", coverage: "full", judgedAt: "2026-09-02T00:00:00.000Z" },
      { keyword: "AIO 対策", topicId: "t2", pageUrl: "https://example.com/b", coverage: "partial", judgedAt: "2026-09-02T00:00:00.000Z" },
    ]);
    expect(aioTopicCoverageStore.get()).toHaveLength(2);
    expect(coverageMap(aioTopicCoverageStore.get(), "AIO 対策", "https://example.com/a")).toEqual({ t1: "full" });
    expect(coverageMap(aioTopicCoverageStore.get(), "AIO 対策", "https://example.com/x")).toEqual({});
    saveCoverage([]);
    expect(aioTopicCoverageStore.get()).toHaveLength(2);
  });

  it("キーワードの記録をまとめて消せる", () => {
    saveExtraction({
      keyword: "AIO 対策",
      takenOn: "2026-09-01",
      aioPresent: true,
      selfCited: false,
      topics: [{ label: "構造化データの追加" }],
    });
    saveCoverage([
      { keyword: "AIO 対策", topicId: "t1", pageUrl: "https://example.com/a", coverage: "none", judgedAt: "2026-09-01T00:00:00.000Z" },
    ]);
    removeKeywordData("AIO 対策");
    expect(aioTopicDaysStore.get()).toEqual([]);
    expect(aioTopicDictStore.get()).toEqual([]);
    expect(aioTopicCoverageStore.get()).toEqual([]);
  });

  it("壊れた値は zod で弾く", () => {
    expect(() => aioTopicDaysStore.set([{ keyword: "x" } as never])).toThrow();
  });
});
