/**
 * 日次バッチの本体（仕様書 §9）。サーバー専用だが、依存は全部引数で受け取るので
 * テストからはダミーを渡して動かせる。
 *
 * 流れ:
 *   1. 当日実行する対象を出す（§2.3 の日次分散。今日の分だけ）
 *   2. 正規化ハッシュでキャッシュ照会 → 24h 以内があれば使い回す（§7.1）
 *   3. 無ければ**標準キュー**で計測（§7.4: 定期実行から Live は呼ばない）
 *   4. Gemini の引用 URL を解決（§1.3）
 *   5. アカウントごとに観測を作る（エイリアス判定・ドメイン分類）
 *   6. モデル更新を検知（§5.3）
 *   7. クレジットを記帳（§6）
 */
import { chargeOnCacheHit, creditAction, creditCost } from "./credits";
import { classifyDomain, judgeCitation, judgeMentions } from "./extract";
import { costUsd, unitPrices } from "./pricing";
import type { GeoProvider } from "./provider";
import { resolveCitations, type ResolveOptions } from "./resolve";
import { RANK_PLAN, repeatsToday, weekPlan } from "./schedule";
import { detectVersionChange } from "./aggregate";
import { GEO_SERP_MODELS, isLlmModel } from "./types";
import type { CreditAction, GeoBrand, GeoKeyword, GeoMeasurement, GeoModel, GeoObservation, GeoPrompt, MeasurementKind } from "./types";
import type { CacheLookup, ObservedMeasurement } from "./store";
import { jstDate, jstParts, JST_OFFSET_MS } from "@/lib/time/jst";

/** 1 つの実行単位（プロンプト or キーワード × モデル × 反復番号） */
export interface RunItem {
  kind: MeasurementKind;
  text: string;
  hash: string;
  model: GeoModel;
  promptId: string | null;
  keywordId: string | null;
  /** 何回目の反復か（1 始まり）。同じ日に 2 回走る高精度枠を区別する */
  repeat: number;
}

/** 配列を `start` 番目から始まるように回す（純関数） */
function rotate<T>(list: readonly T[], start: number): T[] {
  if (list.length === 0) return [];
  const s = ((start % list.length) + list.length) % list.length;
  return [...list.slice(s), ...list.slice(0, s)];
}

/** JST の通し日数（1970-01-01 からの日数）。日ごとに並びを回すのに使う */
function jstDayNumber(now: Date): number {
  return Math.floor((now.getTime() + JST_OFFSET_MS) / (24 * 60 * 60 * 1000));
}

/**
 * 今日実行する一覧を作る（§2.3）。
 * **反復は同じバッチで連続実行しない**という仕様は、ここで「今日の分だけ」に
 * 絞ることで守られる（週の計画を日に割り振ってある）。
 *
 * 並び順（2026-09-23。1 アカウントの持ち時間で後ろが切られるため）:
 *   - **キーワード（順位・AI Overviews・AI モード）は週 1 回しか機会が無い**ので、その曜日は先頭に置く。
 *     以前はプロンプトの後ろにあり、持ち時間切れで毎週切られて 1 度も測れないことがあった
 *   - プロンプトは日ごとに開始位置を回す。いつも同じ（後から登録した）プロンプトが切られないように
 */
export function planToday(
  prompts: readonly GeoPrompt[],
  keywords: readonly GeoKeyword[],
  runDayOffset: number,
  now: Date,
): RunItem[] {
  const promptItems: RunItem[] = [];
  for (const prompt of rotate(prompts, jstDayNumber(now))) {
    const repeats = repeatsToday(weekPlan(prompt.precisionMode), runDayOffset, now);
    for (let r = 1; r <= repeats; r += 1) {
      for (const model of prompt.models) {
        // AI Overviews と AI モードはプロンプトではなくキーワード側で取る
        if (!isLlmModel(model)) continue;
        promptItems.push({ kind: "llm", text: prompt.text, hash: prompt.normalizedHash, model, promptId: prompt.id, keywordId: null, repeat: r });
      }
    }
  }

  const keywordItems: RunItem[] = [];
  const rankRepeats = repeatsToday(RANK_PLAN, runDayOffset, now);
  if (rankRepeats > 0) {
    for (const keyword of keywords) {
      if (keyword.trackRank) {
        keywordItems.push({ kind: "rank", text: keyword.text, hash: keyword.normalizedHash, model: "aio", promptId: null, keywordId: keyword.id, repeat: 1 });
      }
      // `trackAio` は「AI 検索を測る」の印。AI Overviews と AI モードを 1 回ずつ
      // （利用者の決定 2026-09-21「週 1 回でいい」「AI モードも追加したい」）
      if (keyword.trackAio) {
        for (const model of GEO_SERP_MODELS) {
          keywordItems.push({ kind: model, text: keyword.text, hash: keyword.normalizedHash, model, promptId: null, keywordId: keyword.id, repeat: 1 });
        }
      }
    }
  }

  return [...keywordItems, ...promptItems];
}

/** 観測・計測を「何を測ったか」でまとめる鍵（種類 × 対象 × モデル） */
export function targetKey(kind: MeasurementKind, targetId: string | null, model: GeoModel): string {
  return `${kind}|${targetId ?? ""}|${model}`;
}

function itemKey(item: RunItem): string {
  return targetKey(item.kind, item.promptId ?? item.keywordId, item.model);
}

/**
 * 今日すでに観測した計測を、鍵ごとの計測 ID の一覧にする（純関数）。
 * 同じ計測を別の反復として数え直さないため・同じ日に 2 回走っても二重に数えないために使う。
 */
export function usedMeasurements(observed: readonly ObservedMeasurement[]): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const o of observed) {
    const key = targetKey(o.kind, o.promptId ?? o.keywordId, o.model);
    const list = out.get(key) ?? [];
    if (!list.includes(o.measurementId)) list.push(o.measurementId);
    out.set(key, list);
  }
  return out;
}

/**
 * 今日もう済んだ反復を外す（純関数。2026-09-23）。
 *
 * 定期実行が同じ日に 2 回動く（手動の再実行・Cron の再送）と、キャッシュに当たった分まで
 * 観測を保存し直し、クレジットも二重に記帳していた（観測表に一意制約が無いため）。
 * 「その対象を今日すでに n 回観測した」なら反復 1〜n は済みとみなす。途中で時間切れになった日の
 * 再実行は、残りの分だけを測る（再開になる）。
 */
export function skipDone(items: readonly RunItem[], used: ReadonlyMap<string, readonly string[]>): RunItem[] {
  return items.filter((item) => item.repeat > (used.get(itemKey(item))?.length ?? 0));
}

/** その日の日本時間 0:00（ISO） */
export function jstDayStart(now: Date): string {
  const p = jstParts(now);
  return jstDate(p.year, p.month, p.day).toISOString();
}

/** キャッシュを使ってよい時間（§7.1: 24 時間） */
const CACHE_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * キャッシュを引く条件（純関数。2026-09-23）。
 *
 * - **種類を鍵に入れる**: 順位計測も model = "aio" なので、入れないと AI Overviews が順位計測を拾う
 * - **同じアカウントがもう数えた計測は除く**: 高精度枠は同じ日に 2 回走る（§2.3 の PRECISION_PLAN）が、
 *   2 回目が 1 回目の回答をキャッシュから拾うと、同じ回答を 2 度数えて n が倍になり、
 *   Wilson 区間が実際より狭く出ていた。反復は必ず別の回答（独立した標本）にする
 * - **LLM は日をまたいで使い回さない**: 反復を日に散らすのは「日による違い」を捉えるため（§2.3）。
 *   24 時間の窓のままだと、前日の 5:00 過ぎの回答を今日の標本として数えてしまう。
 *   検索結果（順位・AI Overviews・AI モード）は週 1 回なので従来どおり 24 時間
 */
export function cacheLookupFor(item: RunItem, locale: string, now: Date, exclude: readonly string[]): CacheLookup {
  const windowStart = now.getTime() - CACHE_WINDOW_MS;
  const since = item.kind === "llm" ? Math.max(windowStart, Date.parse(jstDayStart(now))) : windowStart;
  return {
    hash: item.hash,
    model: item.model,
    locale,
    kind: item.kind,
    since: new Date(since).toISOString(),
    ...(exclude.length > 0 ? { exclude } : {}),
  };
}

export interface RunDeps {
  provider: GeoProvider;
  locale: string;
  findCached: (lookup: CacheLookup) => Promise<GeoMeasurement | null>;
  saveMeasurement: (input: Omit<GeoMeasurement, "id">) => Promise<GeoMeasurement>;
  saveObservations: (userId: string, rows: readonly Omit<GeoObservation, "id">[]) => Promise<void>;
  recordCredit: (userId: string, action: CreditAction, credits: number, measurementId: string | null, cacheHit: boolean) => Promise<void>;
  latestModelVersion: (model: GeoModel) => Promise<string | null>;
  saveModelVersionEvent: (model: GeoModel, from: string | null, to: string) => Promise<void>;
  resolveOptions?: ResolveOptions;
}

export interface RunSummary {
  planned: number;
  executed: number;
  cacheHits: number;
  failed: number;
  creditsUsed: number;
  costUsd: number;
  observations: number;
  versionEvents: number;
  notes: string[];
  aborted: boolean;
}

export interface RunOptions {
  /** 時間切れの目安。超えたら残りは次回に回す */
  budgetMs?: number;
  now?: Date;
  signal?: AbortSignal;
  /**
   * 今日すでにこのアカウントが観測に使った計測（`listObservedMeasurements` の結果）。
   * 同じ回答を別の反復として数え直さないために使う
   */
  observedToday?: readonly ObservedMeasurement[];
}

/**
 * 1 アカウント分を回す。
 * **モードは standard 固定**。Live はオンデマンド API からしか呼ばない（§7.4）。
 *
 * 保存（Supabase）が失敗したら、そこで打ち切って**それまでの集計を返す**（2026-09-23）。
 * 以前は例外がそのまま上がり、台帳には記帳済みなのに残高が減らない（ずれる）ことがあった。
 */
export async function runForAccount(
  userId: string,
  items: readonly RunItem[],
  brands: readonly GeoBrand[],
  deps: RunDeps,
  options: RunOptions = {},
): Promise<RunSummary> {
  const now = options.now ?? new Date();
  const started = Date.now();
  const budgetMs = options.budgetMs ?? 240_000;
  const prices = unitPrices();
  const own = brands.find((b) => b.type === "own") ?? null;
  const competitors = brands.filter((b) => b.type === "competitor");

  const summary: RunSummary = {
    planned: items.length,
    executed: 0,
    cacheHits: 0,
    failed: 0,
    creditsUsed: 0,
    costUsd: 0,
    observations: 0,
    versionEvents: 0,
    notes: [],
    aborted: false,
  };

  if (!own) {
    summary.notes.push("自社ブランドが登録されていないため実行しませんでした（オンボーディングで登録してください）");
    return summary;
  }

  const seenVersions = new Map<GeoModel, string | null>();
  // 対象ごとに、今日このアカウントが数えた計測（反復を独立した標本にするため）
  const used = usedMeasurements(options.observedToday ?? []);

  for (const item of items) {
    if (Date.now() - started > budgetMs || options.signal?.aborted) {
      summary.aborted = true;
      summary.notes.push(`時間切れのため ${summary.executed + summary.cacheHits} / ${items.length} 件で打ち切りました`);
      break;
    }

    const key = itemKey(item);
    let measurement: GeoMeasurement | null = null;
    let cacheHit = false;

    try {
      try {
        measurement = await deps.findCached(cacheLookupFor(item, deps.locale, now, used.get(key) ?? []));
        cacheHit = measurement !== null;
      } catch {
        measurement = null;
      }

      if (!measurement) {
        const outcome = await deps.provider.run({
          kind: item.kind,
          text: item.text,
          model: item.model,
          locale: deps.locale,
          // 定期バッチは必ず標準キュー（§7.4）。Perplexity だけは Live しか無いので
          // llmPath() 側で Live に落ちる（mode はここでは standard のまま = 会計は下で補正）
          mode: "standard",
          signal: options.signal,
        });
        if (!outcome.result) {
          summary.failed += 1;
          if (outcome.message && !summary.notes.includes(outcome.message)) summary.notes.push(outcome.message);
          // 認証やキー切れは以降も全部失敗するので、そこで止める
          if (outcome.failure === "no-key" || outcome.failure === "rate-limit") {
            summary.aborted = true;
            break;
          }
          continue;
        }

        const citations = await resolveCitations(outcome.result.citations, deps.resolveOptions);
        // Perplexity は標準キューが無く Live しか無いので、原価も Live で数える
        const estimated = costUsd(item.kind, "standard", prices, item.model);
        measurement = await deps.saveMeasurement({
          kind: item.kind,
          normalizedHash: item.hash,
          text: item.text,
          model: item.model,
          locale: deps.locale,
          executedAt: now.toISOString(),
          modelVersion: outcome.result.modelVersion,
          responseText: outcome.result.responseText,
          citations,
          rank: outcome.result.rank,
          // 順位計測だけ自然検索の並びを残す（利用者ごとの順位は集計で引く。2026-09-23）
          organic: item.kind === "rank" ? (outcome.result.organic ?? []) : null,
          mode: "standard",
          costUsd: outcome.result.costUsd ?? estimated,
        });
        summary.executed += 1;
        summary.costUsd += measurement.costUsd;

        // モデル更新の検知（§5.3）。同じバッチ内で何度も見に行かない
        if (measurement.modelVersion) {
          if (!seenVersions.has(item.model)) seenVersions.set(item.model, await deps.latestModelVersion(item.model));
          const change = detectVersionChange(seenVersions.get(item.model) ?? null, measurement.modelVersion);
          if (change.changed && change.to) {
            await deps.saveModelVersionEvent(item.model, change.from, change.to);
            summary.versionEvents += 1;
            seenVersions.set(item.model, change.to);
          }
        }
      } else {
        summary.cacheHits += 1;
      }

      // --- アカウントごとの観測（§9-5） ---
      const hits = await judgeMentions(measurement.responseText, [own, ...competitors], { signal: options.signal });
      const rows: Omit<GeoObservation, "id">[] = [];
      for (const brand of [own, ...competitors]) {
        const hit = hits.find((h) => h.brandId === brand.id);
        const citation = judgeCitation(measurement.citations, brand);
        rows.push({
          measurementId: measurement.id,
          promptId: item.promptId,
          keywordId: item.keywordId,
          brandId: brand.id,
          cited: citation.cited,
          mentioned: hit?.mentioned ?? false,
          mentionConfidence: hit?.confidence ?? 0,
          position: hit?.position ?? null,
          citedDomains: citation.domains,
          domainClass: citation.domains[0] ? classifyDomain(citation.domains[0], own, competitors) : null,
          observedAt: now.toISOString(),
        });
      }
      await deps.saveObservations(userId, rows);
      summary.observations += rows.length;
      used.set(key, [...(used.get(key) ?? []), measurement.id]);

      // --- クレジット記帳（§6 / §11 の決定） ---
      const action = creditAction(item.kind, "standard", item.model);
      if (!cacheHit || chargeOnCacheHit()) {
        const credits = creditCost(action);
        await deps.recordCredit(userId, action, credits, measurement.id, cacheHit);
        summary.creditsUsed += credits;
      }
    } catch (err) {
      // 保存（Supabase）の失敗は以降も続くことが多い。計測だけ進めて費用を出し続けないよう、ここで止める
      summary.failed += 1;
      summary.aborted = true;
      const message = `保存に失敗したため打ち切りました（${err instanceof Error ? err.message : "不明なエラー"}）`;
      if (!summary.notes.includes(message)) summary.notes.push(message);
      break;
    }
  }

  summary.creditsUsed = Math.round(summary.creditsUsed * 100) / 100;
  summary.costUsd = Math.round(summary.costUsd * 1e6) / 1e6;
  return summary;
}
