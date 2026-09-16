import { afterEach, describe, expect, it, vi } from "vitest";
import { dedupeCitations, llmPath, localeParams, parseLlmResult, parseSerpResult, unwrapTask } from "../dataforseo";
import type { GeoProvider, ProviderOutcome, ProviderRequest } from "../provider";
import { needsResolution, resolveCitations } from "../resolve";
import { planToday, runForAccount, type RunDeps, type RunItem } from "../run";
import type { GeoBrand, GeoKeyword, GeoMeasurement, GeoPrompt } from "../types";

const KEEP = { ...process.env };
afterEach(() => {
  process.env = { ...KEEP };
  vi.restoreAllMocks();
});

const MONDAY = new Date("2026-09-14T03:00:00Z");

function prompt(over: Partial<GeoPrompt> = {}): GeoPrompt {
  return {
    id: "p1",
    text: "SEO ツール おすすめ",
    normalizedHash: "hash-p1",
    isBranded: false,
    precisionMode: false,
    models: ["chatgpt", "gemini"],
    tags: [],
    precisionModeChangedAt: null,
    createdAt: "2026-09-01T00:00:00Z",
    ...over,
  };
}

function keyword(over: Partial<GeoKeyword> = {}): GeoKeyword {
  return { id: "k1", text: "SEO ツール", normalizedHash: "hash-k1", trackRank: true, trackAio: true, createdAt: "2026-09-01T00:00:00Z", ...over };
}

function brands(): GeoBrand[] {
  return [
    { id: "own", type: "own", displayName: "サンプル工房", aliases: ["Sample Kobo"], domains: ["sample-kobo.jp"], aliasesUpdatedAt: null, createdAt: "" },
    { id: "rival", type: "competitor", displayName: "ライバル社", aliases: [], domains: ["rival.co.jp"], aliasesUpdatedAt: null, createdAt: "" },
  ];
}

describe("当日の実行計画（§2.3）", () => {
  it("通常プロンプトは月曜に 1 回 × モデル数", () => {
    const items = planToday([prompt()], [], 0, MONDAY);
    const llm = items.filter((i) => i.kind === "llm");
    expect(llm).toHaveLength(2); // chatgpt + gemini
    expect(llm.every((i) => i.repeat === 1)).toBe(true);
  });

  it("高精度プロンプトは月曜に 2 回ずつ（同じ日でも反復番号で区別する）", () => {
    const items = planToday([prompt({ precisionMode: true })], [], 0, MONDAY);
    const chatgpt = items.filter((i) => i.model === "chatgpt");
    expect(chatgpt).toHaveLength(2);
    expect(chatgpt.map((i) => i.repeat)).toEqual([1, 2]);
  });

  it("火曜は通常プロンプトを実行しない（月・水・金だけ）", () => {
    const tuesday = new Date("2026-09-15T03:00:00Z");
    expect(planToday([prompt()], [], 0, tuesday).filter((i) => i.kind === "llm")).toHaveLength(0);
  });

  it("順位と AIO は週 1 回（月曜）だけ", () => {
    const monday = planToday([], [keyword()], 0, MONDAY);
    expect(monday.filter((i) => i.kind === "rank")).toHaveLength(1);
    expect(monday.filter((i) => i.kind === "aio")).toHaveLength(1);
    const wednesday = new Date("2026-09-16T03:00:00Z");
    expect(planToday([], [keyword()], 0, wednesday)).toHaveLength(0);
  });

  it("プロンプトの aio モデルは LLM 計測に混ぜない（検索側で取る）", () => {
    const items = planToday([prompt({ models: ["aio"] })], [], 0, MONDAY);
    expect(items).toHaveLength(0);
  });
});

/* ───────────── バッチ本体 ───────────── */

function fakeProvider(outcome: Partial<ProviderOutcome> = {}, onRun?: (r: ProviderRequest) => void): GeoProvider {
  return {
    id: "fake",
    async run(request) {
      onRun?.(request);
      return {
        result: {
          responseText: "おすすめは サンプル工房 です。ライバル社も候補です。",
          citations: [{ url: "https://sample-kobo.jp/a", unresolved: false, domain: "sample-kobo.jp", title: null }],
          rank: null,
          modelVersion: "gpt-5.1",
          costUsd: null,
        },
        failure: null,
        message: null,
        ...outcome,
      };
    },
  };
}

function deps(over: Partial<RunDeps> = {}): RunDeps & { saved: Omit<GeoMeasurement, "id">[]; credits: { action: string; cacheHit: boolean }[] } {
  const saved: Omit<GeoMeasurement, "id">[] = [];
  const credits: { action: string; cacheHit: boolean }[] = [];
  return {
    provider: fakeProvider(),
    locale: "ja",
    findCached: async () => null,
    saveMeasurement: async (input) => {
      saved.push(input);
      return { ...input, id: `m${saved.length}` };
    },
    saveObservations: async () => {},
    recordCredit: async (_u, action, _c, _m, cacheHit) => {
      credits.push({ action, cacheHit });
    },
    latestModelVersion: async () => null,
    saveModelVersionEvent: async () => {},
    resolveOptions: { resolveImpl: async () => null },
    saved,
    credits,
    ...over,
  } as RunDeps & { saved: Omit<GeoMeasurement, "id">[]; credits: { action: string; cacheHit: boolean }[] };
}

const ITEM: RunItem = { kind: "llm", text: "SEO ツール おすすめ", hash: "h1", model: "chatgpt", promptId: "p1", keywordId: null, repeat: 1 };

describe("バッチ本体（§9）", () => {
  it("定期実行は必ず標準キュー（Live を呼ぶ経路が無い。§7.4）", async () => {
    const seen: ProviderRequest[] = [];
    const d = deps({ provider: fakeProvider({}, (r) => seen.push(r)) });
    await runForAccount("u1", [ITEM], brands(), d);
    expect(seen).toHaveLength(1);
    expect(seen[0].mode).toBe("standard");
    expect(d.saved[0].mode).toBe("standard");
  });

  it("24 時間以内のキャッシュがあれば計測しない（§7.1）", async () => {
    const cached: GeoMeasurement = {
      id: "cached", kind: "llm", normalizedHash: "h1", text: "x", model: "chatgpt", locale: "ja",
      executedAt: "2026-09-16T00:00:00Z", modelVersion: "gpt-5.1", responseText: "サンプル工房 が良いです",
      citations: [], rank: null, mode: "standard", costUsd: 0.0012,
    };
    let called = 0;
    const d = deps({
      findCached: async () => cached,
      provider: { id: "fake", async run() { called += 1; return { result: null, failure: "upstream", message: null }; } },
    });
    const summary = await runForAccount("u1", [ITEM], brands(), d);
    expect(called).toBe(0);
    expect(summary.cacheHits).toBe(1);
    expect(summary.executed).toBe(0);
  });

  it("キャッシュを使い回してもクレジットは記帳する（§11 の決定。既定）", async () => {
    const cached = { id: "c", kind: "llm", normalizedHash: "h1", text: "x", model: "chatgpt", locale: "ja", executedAt: "", modelVersion: null, responseText: "", citations: [], rank: null, mode: "standard", costUsd: 0 } as GeoMeasurement;
    const d = deps({ findCached: async () => cached });
    await runForAccount("u1", [ITEM], brands(), d);
    expect(d.credits).toEqual([{ action: "llm_standard", cacheHit: true }]);
  });

  it("環境変数で「キャッシュ時は課金しない」に切り替えられる", async () => {
    process.env.GEO_CHARGE_ON_CACHE_HIT = "false";
    const cached = { id: "c", kind: "llm", normalizedHash: "h1", text: "x", model: "chatgpt", locale: "ja", executedAt: "", modelVersion: null, responseText: "", citations: [], rank: null, mode: "standard", costUsd: 0 } as GeoMeasurement;
    const d = deps({ findCached: async () => cached });
    await runForAccount("u1", [ITEM], brands(), d);
    expect(d.credits).toHaveLength(0);
  });

  it("自社ブランドが無ければ何もしない（オンボーディング前）", async () => {
    const summary = await runForAccount("u1", [ITEM], [], deps());
    expect(summary.executed).toBe(0);
    expect(summary.notes.join()).toContain("自社ブランドが登録されていない");
  });

  it("認証エラーは以降を打ち切る（失敗し続けて費用だけ出るのを防ぐ）", async () => {
    const d = deps({
      provider: { id: "fake", async run() { return { result: null, failure: "no-key", message: "認証に失敗しました" }; } },
    });
    const summary = await runForAccount("u1", [ITEM, ITEM, ITEM], brands(), d);
    expect(summary.failed).toBe(1);
    expect(summary.aborted).toBe(true);
  });

  it("モデル更新を検知してイベントにする（§5.3）", async () => {
    const events: string[] = [];
    const d = deps({
      latestModelVersion: async () => "gpt-5.0",
      saveModelVersionEvent: async (_m, from, to) => { events.push(`${from}→${to}`); },
    });
    const summary = await runForAccount("u1", [ITEM], brands(), d);
    expect(events).toEqual(["gpt-5.0→gpt-5.1"]);
    expect(summary.versionEvents).toBe(1);
  });

  it("時間切れになったら残りは次回に回す", async () => {
    const d = deps();
    const summary = await runForAccount("u1", [ITEM, ITEM], brands(), d, { budgetMs: -1 });
    expect(summary.aborted).toBe(true);
    expect(summary.executed).toBe(0);
  });
});

/* ───────────── DataForSEO の応答の読み取り ───────────── */

describe("DataForSEO の応答（§1.1）", () => {
  it("エラーのタスクは null にする", () => {
    expect(unwrapTask({ tasks: [{ status_code: 40401, result: null }] })).toBeNull();
    expect(unwrapTask({})).toBeNull();
  });

  it("LLM の応答から本文と引用を取り出す", () => {
    const parsed = parseLlmResult({
      cost: 0.0012,
      tasks: [{
        status_code: 20000,
        result: [{
          model_name: "gpt-5.1",
          items: [{ sections: [{ text: "サンプル工房 がおすすめです", annotations: [{ url: "https://sample-kobo.jp/", text: "サンプル工房" }] }] }],
        }],
      }],
    });
    expect(parsed?.responseText).toContain("サンプル工房");
    expect(parsed?.citations).toHaveLength(1);
    expect(parsed?.citations[0].domain).toBe("sample-kobo.jp");
    expect(parsed?.modelVersion).toBe("gpt-5.1");
    expect(parsed?.costUsd).toBe(0.0012);
  });

  it("AI Overviews の参照リンクを引用として取り出す", () => {
    const parsed = parseSerpResult({
      tasks: [{ status_code: 20000, result: [{ items: [{ type: "ai_overview", text: "概要", references: [{ url: "https://note.com/a", title: "記事" }] }] }] }],
    });
    expect(parsed?.citations[0].domain).toBe("note.com");
    expect(parsed?.responseText).toContain("概要");
  });

  it("自社ドメインの順位を拾う", () => {
    const parsed = parseSerpResult(
      { tasks: [{ status_code: 20000, result: [{ items: [
        { type: "organic", domain: "other.com", rank_absolute: 1 },
        { type: "organic", domain: "www.sample-kobo.jp", rank_absolute: 4 },
      ] }] }] },
      ["sample-kobo.jp"],
    );
    expect(parsed?.rank).toBe(4);
  });

  it("同じ URL の引用は 1 つにまとめる", () => {
    const list = [
      { url: "https://a.com/1", unresolved: false, domain: "a.com", title: null },
      { url: "https://a.com/1", unresolved: false, domain: "a.com", title: null },
    ];
    expect(dedupeCitations(list)).toHaveLength(1);
  });

  it("標準キューと Live はパスが別（設定では切り替えられない。§7.4）", () => {
    expect(llmPath("chatgpt", "standard")).toContain("task_post");
    expect(llmPath("chatgpt", "live")).toContain("/live");
    expect(llmPath("gemini", "standard")).toContain("gemini");
  });

  it("ロケールは日本を既定にする（§11 の決定）", () => {
    expect(localeParams("ja")).toEqual({ locationName: "Japan", languageCode: "ja" });
    expect(localeParams("unknown")).toEqual({ locationName: "Japan", languageCode: "ja" });
  });
});

/* ───────────── Gemini の URL 解決（§1.3） ───────────── */

describe("Gemini の引用 URL の解決", () => {
  it("リダイレクト形式だけを解決の対象にする", () => {
    expect(needsResolution("https://vertexaisearch.cloud.google.com/grounding-api-redirect/xyz")).toBe(true);
    expect(needsResolution("https://note.com/a")).toBe(false);
  });

  it("解決できれば最終ドメインに置き換える", async () => {
    const resolved = await resolveCitations(
      [{ url: "https://vertexaisearch.cloud.google.com/x1", unresolved: false, domain: "", title: null }],
      { resolveImpl: async () => "https://sample-kobo.jp/article" },
    );
    expect(resolved[0].domain).toBe("sample-kobo.jp");
    expect(resolved[0].unresolved).toBe(false);
  });

  it("解決できなくても引用から外さず「不明ドメイン」として残す", async () => {
    const resolved = await resolveCitations(
      [{ url: "https://vertexaisearch.cloud.google.com/x2", unresolved: false, domain: "", title: null }],
      { resolveImpl: async () => null },
    );
    expect(resolved).toHaveLength(1);
    expect(resolved[0].unresolved).toBe(true);
  });
});
