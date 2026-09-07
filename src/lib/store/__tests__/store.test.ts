import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createStore, exportAll, importAll, KEY_PREFIX } from "../createStore";
import {
  addProject,
  buildProject,
  currentProjectIdStore,
  normalizeDomain,
  projectsStore,
  removeProject,
  resolveCurrentProject,
  splitList,
  updateProject,
} from "../projects";

/** node 環境用の localStorage もどき */
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
});

afterEach(() => {
  delete g.localStorage;
});

describe("createStore", () => {
  const schema = z.object({ count: z.number(), tags: z.array(z.string()) });
  const initial = { count: 0, tags: [] as string[] };

  it("キーに接頭辞が付く", () => {
    const store = createStore("test-a", schema, initial);
    expect(store.key).toBe(`${KEY_PREFIX}test-a`);
  });

  it("未保存なら初期値、set したら localStorage に入る", () => {
    const store = createStore("test-b", schema, initial);
    expect(store.get()).toEqual(initial);
    store.set({ count: 2, tags: ["x"] });
    expect(JSON.parse(g.localStorage!.getItem(store.key)!)).toEqual({ count: 2, tags: ["x"] });
    expect(store.get()).toEqual({ count: 2, tags: ["x"] });
  });

  it("参照は値が変わるまで安定している（useSyncExternalStore 向け）", () => {
    const store = createStore("test-c", schema, initial);
    store.set({ count: 1, tags: [] });
    expect(store.get()).toBe(store.get());
  });

  it("壊れた JSON / スキーマ違反は初期値に戻す", () => {
    g.localStorage!.setItem(`${KEY_PREFIX}test-d`, "{not json");
    const broken = createStore("test-d", schema, initial);
    expect(broken.get()).toEqual(initial);

    g.localStorage!.setItem(`${KEY_PREFIX}test-e`, JSON.stringify({ count: "three" }));
    const invalid = createStore("test-e", schema, initial);
    expect(invalid.get()).toEqual(initial);
  });

  it("不正な値の set は例外", () => {
    const store = createStore("test-f", schema, initial);
    expect(() => store.set({ count: "x" } as unknown as typeof initial)).toThrow();
  });

  it("subscribe で通知され、update / reset が効く", () => {
    const store = createStore("test-g", schema, initial);
    let calls = 0;
    const off = store.subscribe(() => {
      calls += 1;
    });
    store.update((p) => ({ ...p, count: p.count + 1 }));
    expect(store.get().count).toBe(1);
    store.reset();
    expect(store.get()).toEqual(initial);
    expect(g.localStorage!.getItem(store.key)).toBeNull();
    expect(calls).toBe(2);
    off();
    store.set({ count: 5, tags: [] });
    expect(calls).toBe(2);
  });

  it("localStorage が無い（SSR）なら初期値を返し、set は例外にならない", () => {
    delete g.localStorage;
    const store = createStore("test-h", schema, initial);
    expect(store.get()).toEqual(initial);
    expect(() => store.set({ count: 1, tags: [] })).not.toThrow();
  });
});

describe("exportAll / importAll", () => {
  it("往復できる。未知・不正なストアは skipped", () => {
    const a = createStore("exp-a", z.number(), 0);
    const b = createStore("exp-b", z.array(z.string()), []);
    a.set(42);
    b.set(["x", "y"]);
    const env = exportAll();
    expect(env.app).toBe("seo-checker");
    expect(env.stores["exp-a"]).toBe(42);
    expect(env.stores["exp-b"]).toEqual(["x", "y"]);

    a.reset();
    b.reset();
    const json = JSON.stringify({
      ...env,
      stores: { ...env.stores, "exp-b": "not-an-array", unknown: 1 },
    });
    const result = importAll(json);
    expect(result.imported).toContain("exp-a");
    expect(result.skipped).toEqual(expect.arrayContaining(["exp-b", "unknown"]));
    expect(a.get()).toBe(42);
    expect(b.get()).toEqual([]);
  });

  it("形式が違えば日本語の例外", () => {
    expect(() => importAll("{oops")).toThrow(/JSON/);
    expect(() => importAll({ foo: 1 })).toThrow(/エクスポートファイル/);
    expect(() => importAll({ app: "seo-checker", version: 99, stores: {} })).toThrow(/バージョン/);
  });
});

describe("projects", () => {
  beforeEach(() => {
    projectsStore.reset();
    currentProjectIdStore.reset();
  });

  it("normalizeDomain / splitList", () => {
    expect(normalizeDomain("https://www.Example.co.jp/path?x=1")).toBe("example.co.jp");
    expect(normalizeDomain("www.example.com")).toBe("example.com");
    expect(normalizeDomain("  ")).toBe("");
    expect(splitList("a, b\nc、a,, ")).toEqual(["a", "b", "c"]);
  });

  it("buildProject は startUrl を補い、競合ドメインを正規化する", () => {
    const p = buildProject({
      name: "",
      domain: "https://www.example.com/",
      competitors: [{ name: "競合", domains: ["https://Rival.jp/"], brandAliases: ["ライバル"] }],
    });
    expect(p.name).toBe("example.com");
    expect(p.startUrl).toBe("https://example.com/");
    expect(p.competitors[0].domains).toEqual(["rival.jp"]);
    expect(p.competitors[0].id).toBeTruthy();
    expect(() => new Date(p.createdAt).toISOString()).not.toThrow();
  });

  it("add / update / remove と現在プロジェクトの追従", () => {
    const first = addProject({ name: "A", domain: "a.example" });
    expect(currentProjectIdStore.get()).toBe(first.id);
    const second = addProject({ name: "B", domain: "b.example" });
    expect(currentProjectIdStore.get()).toBe(first.id);

    updateProject(second.id, { name: "B2", domain: "https://www.b2.example/" });
    const b2 = projectsStore.get().find((p) => p.id === second.id)!;
    expect(b2.name).toBe("B2");
    expect(b2.domain).toBe("b2.example");

    removeProject(first.id);
    expect(currentProjectIdStore.get()).toBe(second.id);
    removeProject(second.id);
    expect(currentProjectIdStore.get()).toBeNull();
    expect(resolveCurrentProject([], null)).toBeNull();
  });

  it("resolveCurrentProject は未選択なら先頭", () => {
    const a = addProject({ name: "A", domain: "a.example" });
    const b = addProject({ name: "B", domain: "b.example" });
    expect(resolveCurrentProject(projectsStore.get(), "nope")?.id).toBe(a.id);
    expect(resolveCurrentProject(projectsStore.get(), b.id)?.id).toBe(b.id);
  });
});
