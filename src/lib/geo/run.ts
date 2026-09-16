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
import type { CreditAction, GeoBrand, GeoKeyword, GeoMeasurement, GeoModel, GeoObservation, GeoPrompt, MeasurementKind } from "./types";

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

/**
 * 今日実行する一覧を作る（§2.3）。
 * **反復は同じバッチで連続実行しない**という仕様は、ここで「今日の分だけ」に
 * 絞ることで守られる（週の計画を日に割り振ってある）。
 */
export function planToday(
  prompts: readonly GeoPrompt[],
  keywords: readonly GeoKeyword[],
  runDayOffset: number,
  now: Date,
): RunItem[] {
  const items: RunItem[] = [];

  for (const prompt of prompts) {
    const repeats = repeatsToday(weekPlan(prompt.precisionMode), runDayOffset, now);
    for (let r = 1; r <= repeats; r += 1) {
      for (const model of prompt.models) {
        // AI Overviews はプロンプトではなくキーワード側で取る
        if (model === "aio") continue;
        items.push({ kind: "llm", text: prompt.text, hash: prompt.normalizedHash, model, promptId: prompt.id, keywordId: null, repeat: r });
      }
    }
  }

  const rankRepeats = repeatsToday(RANK_PLAN, runDayOffset, now);
  if (rankRepeats > 0) {
    for (const keyword of keywords) {
      if (keyword.trackRank) {
        items.push({ kind: "rank", text: keyword.text, hash: keyword.normalizedHash, model: "aio", promptId: null, keywordId: keyword.id, repeat: 1 });
      }
      if (keyword.trackAio) {
        items.push({ kind: "aio", text: keyword.text, hash: keyword.normalizedHash, model: "aio", promptId: null, keywordId: keyword.id, repeat: 1 });
      }
    }
  }

  return items;
}

export interface RunDeps {
  provider: GeoProvider;
  locale: string;
  findCached: (hash: string, model: GeoModel, locale: string) => Promise<GeoMeasurement | null>;
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
}

/**
 * 1 アカウント分を回す。
 * **モードは standard 固定**。Live はオンデマンド API からしか呼ばない（§7.4）。
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

  for (const item of items) {
    if (Date.now() - started > budgetMs || options.signal?.aborted) {
      summary.aborted = true;
      summary.notes.push(`時間切れのため ${summary.executed + summary.cacheHits} / ${items.length} 件で打ち切りました`);
      break;
    }

    let measurement: GeoMeasurement | null = null;
    let cacheHit = false;

    try {
      measurement = await deps.findCached(item.hash, item.model, deps.locale);
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
        // 定期バッチは必ず標準キュー（§7.4）
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
      const estimated = costUsd(item.kind, "standard", prices);
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

    // --- クレジット記帳（§6 / §11 の決定） ---
    const action = creditAction(item.kind, "standard");
    if (!cacheHit || chargeOnCacheHit()) {
      const credits = creditCost(action);
      await deps.recordCredit(userId, action, credits, measurement.id, cacheHit);
      summary.creditsUsed += credits;
    }
  }

  summary.creditsUsed = Math.round(summary.creditsUsed * 100) / 100;
  summary.costUsd = Math.round(summary.costUsd * 1e6) / 1e6;
  return summary;
}
