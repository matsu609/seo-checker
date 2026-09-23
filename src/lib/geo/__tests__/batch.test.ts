/**
 * 日次バッチの直し（2026-09-23）。
 *
 * - キャッシュの鍵に「種類」を入れる（順位計測を AI Overviews が拾わない）
 * - 高精度枠の反復を独立した標本にする（同じ回答を 2 度数えない・前日の回答を今日の標本にしない）
 * - 同じ日の再実行で観測・クレジットを二重にしない
 * - キーワードは週 1 回しか機会が無いので、その曜日は先頭に置く
 * - 保存に失敗しても、記帳済みのクレジットを返す（残高と台帳をずらさない）
 * - 月次リセットを最後の残高更新で消さない
 * - プランで使えない人の分は回さない・前回の続きから回す
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { balanceAfterReset, deductCredits } from "../credits";
import { geoCronSummary, runGeoAccounts, type GeoCronDeps } from "../cron";
import type { GeoProvider, ProviderRequest } from "../provider";
import { cacheLookupFor, jstDayStart, planToday, runForAccount, skipDone, usedMeasurements, type RunDeps, type RunItem } from "../run";
import { cacheQuery, excludeIdsFilter, type CacheLookup, type ObservedMeasurement } from "../store";
import type { GeoBrand, GeoKeyword, GeoMeasurement, GeoPrompt } from "../types";
import type { UserAccess } from "@/lib/plans/user";

afterEach(() => {
  vi.restoreAllMocks();
});

/** 2026-09-14（月）5:00 JST */
const MONDAY_5AM = new Date("2026-09-13T20:00:00Z");

function prompt(over: Partial<GeoPrompt> = {}): GeoPrompt {
  return {
    id: "p1",
    text: "SEO ツール おすすめ",
    normalizedHash: "hash-p1",
    isBranded: false,
    precisionMode: false,
    models: ["chatgpt"],
    tags: [],
    precisionModeChangedAt: null,
    createdAt: "2026-09-01T00:00:00Z",
    ...over,
  };
}

function keyword(over: Partial<GeoKeyword> = {}): GeoKeyword {
  return { id: "k1", text: "SEO ツール", normalizedHash: "hash-k1", trackRank: true, trackAio: true, createdAt: "2026-09-01T00:00:00Z", ...over };
}

const BRANDS: GeoBrand[] = [
  { id: "own", type: "own", displayName: "サンプル工房", aliases: [], domains: ["sample-kobo.jp"], aliasesUpdatedAt: null, createdAt: "" },
];

/**
 * 保存した計測を覚えておき、store.findCachedMeasurement と同じ条件
 * （ハッシュ × モデル × ロケール × 種類、since 以降、除外 ID 以外）で引くダミー。
 */
function memoryDeps(over: Partial<RunDeps> = {}) {
  const measurements: GeoMeasurement[] = [];
  const provided: ProviderRequest[] = [];
  const credits: { credits: number; cacheHit: boolean }[] = [];
  const lookups: CacheLookup[] = [];
  const provider: GeoProvider = {
    id: "fake",
    async run(request) {
      provided.push(request);
      return {
        result: {
          responseText: `回答 ${provided.length}: サンプル工房`,
          citations: [],
          rank: null,
          organic: request.kind === "rank" ? [{ domain: "sample-kobo.jp", rank: 3 }] : null,
          modelVersion: null,
          costUsd: null,
        },
        failure: null,
        message: null,
      };
    },
  };
  const deps: RunDeps = {
    provider,
    locale: "ja",
    findCached: async (lookup) => {
      lookups.push(lookup);
      const since = lookup.since ? Date.parse(lookup.since) : 0;
      const hit = [...measurements]
        .reverse()
        .find(
          (m) =>
            m.normalizedHash === lookup.hash &&
            m.model === lookup.model &&
            m.locale === lookup.locale &&
            m.kind === lookup.kind &&
            Date.parse(m.executedAt) >= since &&
            !(lookup.exclude ?? []).includes(m.id),
        );
      return hit ?? null;
    },
    saveMeasurement: async (input) => {
      const saved = { ...input, id: `00000000-0000-4000-8000-${String(measurements.length + 1).padStart(12, "0")}` };
      measurements.push(saved);
      return saved;
    },
    saveObservations: async () => {},
    recordCredit: async (_u, _a, c, _m, cacheHit) => {
      credits.push({ credits: c, cacheHit });
    },
    latestModelVersion: async () => null,
    saveModelVersionEvent: async () => {},
    resolveOptions: { resolveImpl: async () => null },
    ...over,
  };
  return { deps, measurements, provided, credits, lookups };
}

describe("キャッシュの鍵に種類を入れる（G3）", () => {
  it("順位計測と AI Overviews は同じ model でも別の計測として取る", async () => {
    const items = planToday([], [keyword({ trackAio: true })], 0, MONDAY_5AM).filter((i) => i.kind === "rank" || i.kind === "aio");
    expect(items.map((i) => [i.kind, i.model])).toEqual([
      ["rank", "aio"],
      ["aio", "aio"],
    ]);
    const m = memoryDeps();
    const summary = await runForAccount("u1", items, BRANDS, m.deps, { now: MONDAY_5AM });
    // AI Overviews は順位計測（load_async_ai_overview なし）を使い回さず、自分で取る
    expect(m.provided.map((r) => r.kind)).toEqual(["rank", "aio"]);
    expect(summary.cacheHits).toBe(0);
    expect(m.lookups.map((l) => l.kind)).toEqual(["rank", "aio"]);
  });

  it("問い合わせに種類の条件が入る", () => {
    const q = cacheQuery({ hash: "h", model: "aio", locale: "ja", kind: "aio", since: "2026-09-13T20:00:00.000Z" });
    expect(q).toContain("&kind=eq.aio");
    expect(q).toContain("&model=eq.aio");
    expect(q).toContain("order=executed_at.desc,id.desc");
  });

  it("除外する ID は uuid の形のものだけを入れる（URL に値を差し込まない）", () => {
    expect(excludeIdsFilter(["00000000-0000-4000-8000-000000000001", "x&order=1"])).toBe("&id=not.in.(00000000-0000-4000-8000-000000000001)");
    expect(excludeIdsFilter([])).toBe("");
    expect(excludeIdsFilter(undefined)).toBe("");
  });
});

describe("反復を独立した標本にする（G4）", () => {
  it("高精度枠の 2 回目は 1 回目の回答を使い回さない（同じ日の同じバッチ）", async () => {
    const items = planToday([prompt({ precisionMode: true })], [], 0, MONDAY_5AM);
    expect(items.map((i) => i.repeat)).toEqual([1, 2]);
    const m = memoryDeps();
    const summary = await runForAccount("u1", items, BRANDS, m.deps, { now: MONDAY_5AM });
    expect(m.provided).toHaveLength(2);
    expect(new Set(m.measurements.map((x) => x.id)).size).toBe(2);
    expect(summary.executed).toBe(2);
    expect(summary.cacheHits).toBe(0);
    // 2 回目の照会では 1 回目の計測を除いている
    expect(m.lookups[1].exclude).toEqual([m.measurements[0].id]);
  });

  it("別のアカウントが先に 2 回測っていれば、2 回とも（別々の回答を）使い回せる", async () => {
    const items = planToday([prompt({ precisionMode: true })], [], 0, MONDAY_5AM);
    const m = memoryDeps();
    await runForAccount("u1", items, BRANDS, m.deps, { now: MONDAY_5AM });
    const second = await runForAccount("u2", items, BRANDS, m.deps, { now: MONDAY_5AM });
    expect(second.cacheHits).toBe(2);
    expect(m.provided).toHaveLength(2); // u2 のぶんは計測していない
    // u2 の 2 回は別々の計測
    expect(m.lookups.slice(2).map((l) => l.exclude ?? [])).toEqual([[], [m.measurements[1].id]]);
  });

  it("LLM は日をまたいで使い回さない（前日 5:00 過ぎの回答を今日の標本にしない）。検索結果は 24 時間", () => {
    const tuesday = new Date("2026-09-14T20:00:00Z"); // 9/15（火）5:00 JST
    const llm: RunItem = { kind: "llm", text: "x", hash: "h", model: "chatgpt", promptId: "p1", keywordId: null, repeat: 1 };
    const rank: RunItem = { kind: "rank", text: "x", hash: "h", model: "aio", promptId: null, keywordId: "k1", repeat: 1 };
    expect(cacheLookupFor(llm, "ja", tuesday, []).since).toBe(jstDayStart(tuesday));
    expect(jstDayStart(tuesday)).toBe("2026-09-14T15:00:00.000Z"); // 9/15 0:00 JST
    expect(cacheLookupFor(rank, "ja", tuesday, []).since).toBe("2026-09-13T20:00:00.000Z");
  });
});

describe("同じ日の再実行（J5）", () => {
  const observed = (over: Partial<ObservedMeasurement>): ObservedMeasurement => ({
    measurementId: "00000000-0000-4000-8000-000000000001",
    promptId: "p1",
    keywordId: null,
    kind: "llm",
    model: "chatgpt",
    ...over,
  });

  it("今日もう観測した反復は外す（残りだけを測る = 再開になる）", () => {
    const items = planToday([prompt({ precisionMode: true })], [keyword()], 0, MONDAY_5AM);
    const used = usedMeasurements([
      observed({}),
      observed({ measurementId: "00000000-0000-4000-8000-000000000002", promptId: null, keywordId: "k1", kind: "rank", model: "aio" }),
    ]);
    const left = skipDone(items, used);
    // 高精度の 1 回目と順位計測は済み。2 回目・AI Overviews・AI モードが残る
    expect(left.map((i) => `${i.kind}:${i.model}:${i.repeat}`)).toEqual(["aio:aio:1", "ai_mode:ai_mode:1", "llm:chatgpt:2"]);
  });

  it("再実行ではキャッシュに当たってもクレジットを二重に記帳しない", async () => {
    const items = planToday([prompt()], [], 0, MONDAY_5AM);
    const m = memoryDeps();
    await runForAccount("u1", items, BRANDS, m.deps, { now: MONDAY_5AM });
    expect(m.credits).toHaveLength(1);
    const observedToday = [observed({ measurementId: m.measurements[0].id })];
    const again = skipDone(items, usedMeasurements(observedToday));
    expect(again).toHaveLength(0);
  });
});

describe("キーワードを先に回す（G8）", () => {
  it("順位・AIO の曜日はキーワードが先頭（持ち時間切れで毎週切られない）", () => {
    const items = planToday([prompt()], [keyword()], 0, MONDAY_5AM);
    expect(items.map((i) => i.kind)).toEqual(["rank", "aio", "ai_mode", "llm"]);
  });

  it("プロンプトは日ごとに開始位置を回す（いつも同じプロンプトが切られない）", () => {
    const prompts = [prompt({ id: "a" }), prompt({ id: "b" }), prompt({ id: "c" })];
    const wednesday = new Date("2026-09-15T20:00:00Z"); // 9/16（水）
    const friday = new Date("2026-09-17T20:00:00Z"); // 9/18（金）
    const firstOn = (d: Date) => planToday(prompts, [], 0, d)[0].promptId;
    const starts = new Set([firstOn(MONDAY_5AM), firstOn(wednesday), firstOn(friday)]);
    expect(starts.size).toBeGreaterThan(1);
    // 並びは回るだけで、数は変わらない
    expect(planToday(prompts, [], 0, wednesday)).toHaveLength(3);
  });
});

describe("保存の失敗で台帳と残高をずらさない（G10）", () => {
  it("観測の保存が落ちたら打ち切り、それまでに記帳した分を返す（例外を投げない）", async () => {
    let calls = 0;
    const m = memoryDeps({
      saveObservations: async () => {
        calls += 1;
        if (calls === 2) throw new Error("データベースに接続できませんでした");
      },
    });
    const items = planToday([prompt({ id: "a", normalizedHash: "ha" }), prompt({ id: "b", normalizedHash: "hb" }), prompt({ id: "c", normalizedHash: "hc" })], [], 0, MONDAY_5AM);
    const summary = await runForAccount("u1", items, BRANDS, m.deps, { now: MONDAY_5AM });
    expect(summary.aborted).toBe(true);
    expect(summary.failed).toBe(1);
    expect(m.credits).toHaveLength(1);
    expect(summary.creditsUsed).toBe(0.5);
    expect(summary.notes.join()).toContain("保存に失敗したため打ち切りました");
  });
});

describe("月次リセット（G5）", () => {
  it("リセット時刻を過ぎていれば 2,000 から引く（リセット前の残高から引かない）", () => {
    const account = { creditBalance: 12.5, creditResetAt: "2026-09-30T15:00:00.000Z" };
    const now = new Date("2026-09-30T20:00:00Z"); // 10/1 5:00 JST
    const reset = balanceAfterReset(account, now);
    expect(reset).toEqual({ balance: 2000, reset: true });
    expect(deductCredits(reset.balance, 3.5)).toBe(1996.5);
  });

  it("リセット前なら残高はそのまま", () => {
    expect(balanceAfterReset({ creditBalance: 12.5, creditResetAt: "2026-09-30T15:00:00.000Z" }, new Date("2026-09-20T00:00:00Z"))).toEqual({ balance: 12.5, reset: false });
    expect(deductCredits(0.3, 0.5)).toBe(-0.2);
  });
});

describe("アカウントの回し方（G7 / G8）", () => {
  const access = (over: Partial<UserAccess> = {}): UserAccess => ({ userId: "x", plan: "premium", overrides: [], admin: false, email: null, missing: false, ...over });
  const summary = { planned: 1, executed: 1, cacheHits: 0, failed: 0, creditsUsed: 0.5, costUsd: 0, observations: 1, versionEvents: 0, notes: [], aborted: false };

  function cronDeps(over: Partial<GeoCronDeps> = {}): GeoCronDeps & { ran: string[] } {
    const ran: string[] = [];
    return {
      listAccounts: async () => [{ userId: "u3" }, { userId: "u1" }, { userId: "u2" }],
      access: async () => access(),
      runDaily: async (userId) => {
        ran.push(userId);
        return summary;
      },
      cursor: async () => null,
      ran,
      ...over,
    };
  }

  it("プランで AI 検索モニタリングを使えない人は回さない（実費を出さない）", async () => {
    const deps = cronDeps({ access: async (userId) => access({ plan: userId === "u2" ? "free" : "premium" }) });
    const result = await runGeoAccounts(deps, { budgetMs: 60_000, perAccountMs: 1_000 });
    expect(deps.ran).toEqual(["u1", "u3"]);
    expect(result.skippedPlan).toBe(1);
    expect(result.processed).toBe(2);
    expect(result.creditsUsed).toBe(1);
  });

  it("取得できなかった利用者（missing）も回さない", async () => {
    const deps = cronDeps({ access: async () => access({ missing: true }) });
    await runGeoAccounts(deps, { budgetMs: 60_000, perAccountMs: 1_000 });
    expect(deps.ran).toEqual([]);
  });

  it("前回たどり着けなかったアカウントから始め、一周する", async () => {
    const deps = cronDeps({ cursor: async () => "u2" });
    await runGeoAccounts(deps, { budgetMs: 60_000, perAccountMs: 1_000 });
    expect(deps.ran).toEqual(["u2", "u3", "u1"]);
  });

  it("時間切れのときは次に始めるアカウントを記録に残す", async () => {
    const deps = cronDeps();
    const result = await runGeoAccounts(deps, { budgetMs: -1, perAccountMs: 1_000 });
    expect(result.aborted).toBe(true);
    expect(result.nextStart).toBe("u1");
    expect(geoCronSummary(result)).toMatchObject({ nextStart: "u1", aborted: true });
    expect(geoCronSummary({ ...result, aborted: false, nextStart: null })).not.toHaveProperty("nextStart");
  });

  it("1 人の失敗で後ろを止めない", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const deps = cronDeps({
      runDaily: async (userId) => {
        if (userId === "u1") throw new Error("壊れた");
        deps.ran.push(userId);
        return summary;
      },
    });
    const result = await runGeoAccounts(deps, { budgetMs: 60_000, perAccountMs: 1_000 });
    expect(deps.ran).toEqual(["u2", "u3"]);
    expect(result.failed).toBe(1);
  });
});
