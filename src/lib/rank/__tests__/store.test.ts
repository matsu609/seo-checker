import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { RankMeasurement } from "../types";
import {
  addGroup,
  addKeyword,
  addKeywords,
  buildKeyword,
  filterKeywords,
  isDuplicateKeyword,
  MAX_SNAPSHOTS_PER_KEYWORD,
  mergeSnapshots,
  rankGroupsStore,
  rankKeywordsStore,
  rankSnapshotsStore,
  removeGroup,
  removeKeyword,
  saveSnapshots,
  snapshotsFor,
  toObservations,
  toSnapshot,
  updateKeyword,
  type RankSnapshot,
} from "../store";

function measurement(overrides: Partial<RankMeasurement> = {}): RankMeasurement {
  return {
    keyword: "AIO 対策",
    device: "desktop",
    rank: 4,
    url: "https://example.com/aio",
    title: "AIO 対策の基本",
    competitors: [{ domain: "rival.co.jp", rank: 2, url: "https://rival.co.jp/aio", title: "競合" }],
    aiOverview: {
      present: true,
      selfCited: true,
      competitorCited: false,
      references: [{ url: "https://example.com/aio", title: "自社", domain: "example.com" }],
      citedCompetitors: undefined,
      text: "AIO の説明",
    },
    features: ["ai_overview", "people_also_ask"],
    totalResults: 1000,
    fetchedAt: "2026-09-05T02:00:00.000Z",
    ...overrides,
  };
}

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
  rankKeywordsStore.reset();
  rankGroupsStore.reset();
  rankSnapshotsStore.reset();
});

afterEach(() => {
  delete g.localStorage;
});

describe("キーワード登録", () => {
  it("追加・更新・削除が往復する", () => {
    const created = addKeyword({ projectId: "p1", keyword: "  AIO 対策  ", device: "mobile", location: "Tokyo, Japan" });
    expect(created).not.toBeNull();
    expect(rankKeywordsStore.get()).toHaveLength(1);
    expect(rankKeywordsStore.get()[0]).toMatchObject({
      projectId: "p1",
      keyword: "AIO 対策",
      device: "mobile",
      location: "Tokyo, Japan",
    });

    updateKeyword(created!.id, { monthlyVolume: 1200, targetUrl: "https://example.com/aio" });
    expect(rankKeywordsStore.get()[0].monthlyVolume).toBe(1200);

    removeKeyword(created!.id);
    expect(rankKeywordsStore.get()).toEqual([]);
  });

  it("保存した値は zod で検証される（壊れた値は弾く）", () => {
    expect(() =>
      rankKeywordsStore.set([{ id: "x", projectId: "p1", keyword: "a", device: "watch", createdAt: "" } as never]),
    ).toThrow();
  });

  it("同じプロジェクト・同じデバイスの重複は登録しない", () => {
    addKeyword({ projectId: "p1", keyword: "AIO 対策" });
    expect(addKeyword({ projectId: "p1", keyword: "AIO 対策" })).toBeNull();
    // デバイスやプロジェクトが違えば別扱い
    expect(addKeyword({ projectId: "p1", keyword: "AIO 対策", device: "mobile" })).not.toBeNull();
    expect(addKeyword({ projectId: "p2", keyword: "AIO 対策" })).not.toBeNull();
    expect(isDuplicateKeyword(rankKeywordsStore.get(), "p1", "AIO 対策", "desktop")).toBe(true);
  });

  it("空文字は登録しない", () => {
    expect(addKeyword({ projectId: "p1", keyword: "   " })).toBeNull();
    expect(addKeywords(["a", "", "b", "a"], { projectId: "p1" })).toHaveLength(2);
  });

  it("buildKeyword は空の任意項目を持たせない", () => {
    const k = buildKeyword({ projectId: "", keyword: "x", location: "  ", targetUrl: "" });
    expect(k.location).toBeUndefined();
    expect(k.targetUrl).toBeUndefined();
    expect(k.groupId).toBeUndefined();
  });
});

describe("グループ", () => {
  it("同名は作り直さず、削除するとキーワードから外れる", () => {
    const group = addGroup("注力 KW");
    expect(addGroup(" 注力 KW ")?.id).toBe(group!.id);
    expect(addGroup("  ")).toBeNull();

    const k = addKeyword({ projectId: "p1", keyword: "AIO 対策", groupId: group!.id });
    expect(filterKeywords(rankKeywordsStore.get(), { groupId: group!.id })).toHaveLength(1);

    removeGroup(group!.id);
    expect(rankGroupsStore.get()).toEqual([]);
    expect(rankKeywordsStore.get().find((x) => x.id === k!.id)?.groupId).toBeUndefined();
  });
});

describe("スナップショット", () => {
  it("計測結果を保存し、同じ日は後勝ちで置き換える", () => {
    const k = addKeyword({ projectId: "p1", keyword: "AIO 対策" })!;
    saveSnapshots([toSnapshot(k.id, measurement(), "2026-09-05")]);
    saveSnapshots([toSnapshot(k.id, measurement({ rank: 2 }), "2026-09-05")]);
    saveSnapshots([toSnapshot(k.id, measurement({ rank: 9 }), "2026-09-06")]);

    const list = snapshotsFor(rankSnapshotsStore.get(), k.id);
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ takenOn: "2026-09-05", rank: 2 });
    expect(list[1]).toMatchObject({ takenOn: "2026-09-06", rank: 9 });
    expect(list[0].aiOverview.references).toHaveLength(1);
    expect(list[0].aiOverview.citedCompetitors).toBeUndefined();
    // AIO 本文は最新の 1 件だけ残す（localStorage を食わせない）
    expect(list[0].aiOverview.text).toBeUndefined();
    expect(list[1].aiOverview.text).toBe("AIO の説明");
  });

  it("キーワードを消すと履歴も消える", () => {
    const k = addKeyword({ projectId: "p1", keyword: "AIO 対策" })!;
    saveSnapshots([toSnapshot(k.id, measurement(), "2026-09-05")]);
    removeKeyword(k.id);
    expect(rankSnapshotsStore.get()).toEqual([]);
  });

  it("上限を超えた履歴は古い順に捨てる", () => {
    const many: RankSnapshot[] = Array.from({ length: MAX_SNAPSHOTS_PER_KEYWORD + 5 }, (_, i) => ({
      keywordId: "k1",
      takenOn: `2026-${String(Math.floor(i / 28) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`,
      measuredAt: "2026-09-05T00:00:00.000Z",
      rank: i + 1,
      url: null,
      title: null,
      competitors: [],
      aiOverview: { present: false, selfCited: false, competitorCited: false, references: [] },
      features: [],
    }));
    const merged = mergeSnapshots([], many);
    expect(merged).toHaveLength(MAX_SNAPSHOTS_PER_KEYWORD);
    expect(merged[0].takenOn > many[0].takenOn).toBe(true);
  });

  it("5 区分の観測に変換できる", () => {
    const k = addKeyword({ projectId: "p1", keyword: "AIO 対策" })!;
    saveSnapshots([
      toSnapshot(k.id, measurement(), "2026-09-05"),
      toSnapshot(
        k.id,
        measurement({
          aiOverview: { present: true, selfCited: false, competitorCited: true, references: [] },
        }),
        "2026-09-06",
      ),
    ]);
    expect(toObservations(rankSnapshotsStore.get())).toEqual([
      { keywordId: k.id, takenOn: "2026-09-05", aioClass: "self" },
      { keywordId: k.id, takenOn: "2026-09-06", aioClass: "competitor" },
    ]);
  });

  it("空の保存は何もしない", () => {
    saveSnapshots([]);
    expect(rankSnapshotsStore.get()).toEqual([]);
  });
});
