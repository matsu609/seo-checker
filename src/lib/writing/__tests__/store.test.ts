/**
 * 下書きストア（localStorage + zod）。node 環境なので localStorage は差し替える。
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addDraft,
  buildDraft,
  currentDraftIdStore,
  DraftSchema,
  draftsStore,
  findDraft,
  MAX_DRAFTS,
  MAX_VERSIONS,
  mergeDraft,
  pushVersion,
  removeDraft,
  restoreDraftVersion,
  restoreVersion,
  saveVersion,
  updateDraft,
  writingSettingsStore,
} from "../store";
import type { ArticleOutline } from "../types";

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

const outline: ArticleOutline = {
  search_intent: "意図",
  audience: "読者",
  common_topics: ["共通"],
  missing_topics: ["不足"],
  title_suggestions: ["タイトル"],
  description_suggestions: ["説明"],
  outline: [{ h2: "見出し", h3: ["小見出し"], goal: "狙い", target_chars: 600 }],
};

beforeEach(() => {
  g.localStorage = new FakeStorage();
  draftsStore.reset();
  currentDraftIdStore.reset();
  writingSettingsStore.reset();
});

afterEach(() => {
  delete g.localStorage;
});

describe("buildDraft", () => {
  it("本文があれば初回バージョンを 1 件持つ", () => {
    const draft = buildDraft({ keyword: "AIO 対策", markdown: "# 本文", outline });
    expect(DraftSchema.safeParse(draft).success).toBe(true);
    expect(draft.title).toBe("AIO 対策");
    expect(draft.versions).toHaveLength(1);
    expect(draft.versions[0].label).toBe("初回生成");
    expect(draft.outline).toEqual(outline);
  });

  it("本文が無ければバージョンは空、タイトルは既定", () => {
    const draft = buildDraft({});
    expect(draft.versions).toEqual([]);
    expect(draft.title).toBe("無題の記事");
  });
});

describe("localStorage への往復", () => {
  it("保存した下書きを読み戻せる（別インスタンスの読み出しでも同じ）", () => {
    const draft = addDraft({ keyword: "AIO 対策", markdown: "# 本文", outline });
    expect(draftsStore.get()).toHaveLength(1);
    expect(currentDraftIdStore.get()).toBe(draft.id);

    // localStorage から読み直しても同じ内容
    const raw = g.localStorage?.getItem("seo-checker:v1:writingDrafts");
    expect(raw).toBeTruthy();
    const parsed = DraftSchema.array().safeParse(JSON.parse(raw as string));
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data[0].markdown).toBe("# 本文");
  });

  it("壊れた値は初期値に戻る", () => {
    g.localStorage?.setItem("seo-checker:v1:writingDrafts", '{"broken": true}');
    expect(draftsStore.get()).toEqual([]);
  });

  it("設定も往復する", () => {
    writingSettingsStore.set({ ...writingSettingsStore.get(), keyword: "AIO 対策", tone: "dearu" });
    expect(writingSettingsStore.get().keyword).toBe("AIO 対策");
    expect(writingSettingsStore.get().tone).toBe("dearu");
  });
});

describe("mergeDraft", () => {
  it("同じ ID は置き換え、上限で切る", () => {
    const first = buildDraft({ keyword: "1つ目" });
    let list = mergeDraft([], first);
    list = mergeDraft(list, { ...first, title: "更新後" });
    expect(list).toHaveLength(1);
    expect(list[0].title).toBe("更新後");

    for (let i = 0; i < MAX_DRAFTS + 5; i += 1) list = mergeDraft(list, buildDraft({ keyword: `k${i}` }));
    expect(list).toHaveLength(MAX_DRAFTS);
  });
});

describe("バージョン履歴", () => {
  it("saveVersion で履歴が増え、本文も更新される", () => {
    const draft = addDraft({ keyword: "k", markdown: "初版" });
    saveVersion(draft.id, "第2版", "校正");
    const stored = findDraft(draftsStore.get(), draft.id);
    expect(stored?.markdown).toBe("第2版");
    expect(stored?.versions.map((v) => v.label)).toEqual(["校正", "初回生成"]);
  });

  it("updateDraft は履歴を増やさない（入力中の保存）", () => {
    const draft = addDraft({ keyword: "k", markdown: "初版" });
    updateDraft(draft.id, { markdown: "入力中" });
    const stored = findDraft(draftsStore.get(), draft.id);
    expect(stored?.markdown).toBe("入力中");
    expect(stored?.versions).toHaveLength(1);
  });

  it("restoreVersion は選んだ版の本文に戻し、その操作も 1 版として残す（純関数）", () => {
    let draft = buildDraft({ keyword: "k", markdown: "初版" });
    draft = pushVersion(draft, "第2版", "校正");
    const firstVersionId = draft.versions[draft.versions.length - 1].id;
    const restored = restoreVersion(draft, firstVersionId);
    expect(restored.markdown).toBe("初版");
    expect(restored.versions[0].label).toBe("復元: 初回生成");
    expect(restored.versions).toHaveLength(3);
  });

  it("存在しない版を指定しても壊れない", () => {
    const draft = buildDraft({ keyword: "k", markdown: "初版" });
    expect(restoreVersion(draft, "無い ID")).toBe(draft);
  });

  it("ストア経由でも復元できる", () => {
    const draft = addDraft({ keyword: "k", markdown: "初版" });
    saveVersion(draft.id, "第2版", "校正");
    const target = findDraft(draftsStore.get(), draft.id)?.versions.find((v) => v.label === "初回生成");
    restoreDraftVersion(draft.id, target?.id ?? "");
    expect(findDraft(draftsStore.get(), draft.id)?.markdown).toBe("初版");
  });

  it("履歴は上限で切る", () => {
    let draft = buildDraft({ keyword: "k", markdown: "初版" });
    for (let i = 0; i < MAX_VERSIONS + 10; i += 1) draft = pushVersion(draft, `版${i}`, `更新${i}`);
    expect(draft.versions).toHaveLength(MAX_VERSIONS);
    expect(draft.versions[0].markdown).toBe(`版${MAX_VERSIONS + 9}`);
  });
});

describe("削除と検索", () => {
  it("removeDraft で消え、findDraft は null を返す", () => {
    const draft = addDraft({ keyword: "k", markdown: "本文" });
    removeDraft(draft.id);
    expect(draftsStore.get()).toEqual([]);
    expect(findDraft(draftsStore.get(), draft.id)).toBeNull();
    expect(findDraft([], null)).toBeNull();
  });
});
