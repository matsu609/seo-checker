/**
 * 画面・API から使う入り口（仕様書 §9 のバッチと、オンデマンド実行）。サーバー専用。
 *
 * store.ts（保存）と run.ts（バッチ）と provider（取得）をつなぐ層。
 * ここだけが「本物の依存」を組み立て、run.ts 自体は純粋に保つ。
 */
import { isAnthropicEnabled } from "@/lib/llm/anthropic";
import { defaultLocale, getGeoProvider, isDataForSeoConfigured } from "./dataforseo";
import { fetchTopDomains, type MentionsReport } from "./mentions";
import { balanceAfterReset, canRun, creditAction, creditCost, deductCredits, nextResetAt } from "./credits";
import { costUsd, mentionsCostUsd, unitPrices } from "./pricing";
import { classifyDomain, judgeCitation, judgeMentions } from "./extract";
import { resolveCitations } from "./resolve";
import { jstDayStart, planToday, runForAccount, skipDone, usedMeasurements, type RunSummary } from "./run";
import {
  ensureAccount,
  findCachedMeasurement,
  latestModelVersion,
  listBrands,
  listObservedMeasurements,
  listPrompts,
  recordCredit,
  saveMeasurement,
  saveModelVersionEvent,
  saveObservations,
  updateAccount,
} from "./store";
import { syncGeoFromSettings } from "./sync";
import { loadSharedSettings } from "@/lib/settings/server";
import type { CreditAction, GeoAccount, GeoModel, GeoObservation, MentionPlatform } from "./types";

/** アカウントを読み、月が変わっていればリセット（繰越なし。§6.1）を当てて保存してから返す */
async function loadAccountWithReset(userId: string, now: Date): Promise<GeoAccount> {
  const account = await ensureAccount(userId, now);
  const reset = balanceAfterReset(account, now);
  if (!reset.reset) return account;
  const creditResetAt = nextResetAt(now);
  await updateAccount(userId, { creditBalance: reset.balance, creditResetAt });
  return { ...account, creditBalance: reset.balance, creditResetAt };
}

/**
 * 使った分を残高から引いて保存し、新しい残高を返す。
 * **書く直前に読み直す**（計測に数十秒かかる間に、別の実行（定期実行と「今すぐ実行」）が
 * 残高を減らしていても、古い値で上書きして消さない。2026-09-23）
 */
async function chargeBalance(userId: string, credits: number, now: Date): Promise<number> {
  const latest = await loadAccountWithReset(userId, now);
  const balance = deductCredits(latest.creditBalance, credits);
  await updateAccount(userId, { creditBalance: balance });
  return balance;
}

/** 定期バッチが 1 アカウント分を回す */
export async function runDailyForUser(userId: string, options: { now?: Date; budgetMs?: number; signal?: AbortSignal } = {}): Promise<RunSummary> {
  const now = options.now ?? new Date();
  const provider = getGeoProvider();
  if (!provider) {
    return emptySummary("DataForSEO が未設定のため計測していません（DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD）");
  }

  // 月次リセット（繰越なし。§6.1）はここで当てて保存する
  const account = await loadAccountWithReset(userId, now);

  // ブランド・競合・キーワードは設定（/settings）が正。計測の前に geo テーブルへ写す（2026-09-19）
  const synced = await syncGeoFromSettings(userId, await loadSharedSettings(userId));
  const brands = synced.brands;
  const keywords = synced.keywords;
  const prompts = await listPrompts(userId);
  // 今日すでに観測した分は測り直さない（同じ日の再実行で観測とクレジットが二重にならないように。2026-09-23）
  const observedToday = await listObservedMeasurements(userId, jstDayStart(now));
  const items = skipDone(planToday(prompts, keywords, account.runDayOffset, now), usedMeasurements(observedToday));
  if (items.length === 0) return emptySummary("今日は実行対象がありません（反復は週内の別の日に分散しています）");

  // runForAccount は保存の失敗でも例外を投げず、それまでに**台帳へ記帳した分だけ**を creditsUsed で返す。
  // 以前は途中の例外で残高の更新が飛ばされ、台帳と残高がずれていた（2026-09-23）
  const summary = await runForAccount(
    userId,
    items,
    brands,
    {
      provider,
      locale: defaultLocale(),
      findCached: (lookup) => findCachedMeasurement(lookup, now),
      saveMeasurement,
      saveObservations,
      recordCredit,
      latestModelVersion,
      saveModelVersionEvent,
    },
    { now, budgetMs: options.budgetMs, signal: options.signal, observedToday },
  );

  if (summary.creditsUsed > 0) await chargeBalance(userId, summary.creditsUsed, now);
  if (!isAnthropicEnabled()) {
    summary.notes.push("ブランド参照は文字列一致だけで判定しています（ANTHROPIC_API_KEY があれば文脈で確かめます）");
  }
  return summary;
}

function emptySummary(note: string): RunSummary {
  return { planned: 0, executed: 0, cacheHits: 0, failed: 0, creditsUsed: 0, costUsd: 0, observations: 0, versionEvents: 0, notes: [note], aborted: false };
}

/* ───────────── オンデマンド実行（Live。§1.2 / §6.2） ───────────── */

export interface LiveRunResult {
  ok: boolean;
  message: string;
  creditsUsed: number;
  balance: number;
  responseText: string;
  citations: { url: string; domain: string; unresolved: boolean }[];
  mentioned: { brandId: string; displayName: string; mentioned: boolean; confidence: number }[];
}

/**
 * 「今すぐ実行」。**ここだけが Live モードを使う**（§7.4）。
 * 残高が足りなければ実行しない（ソフトキャップはオンデマンドにだけ効く）。
 */
export async function runLive(userId: string, promptText: string, model: GeoModel, options: { now?: Date; signal?: AbortSignal } = {}): Promise<LiveRunResult> {
  const now = options.now ?? new Date();
  const provider = getGeoProvider();
  if (!provider) {
    return fail("DataForSEO が未設定です", 0);
  }

  // 月が変わっていればリセットしてから残高を見る（定期実行より先に押されても先月の残高で止めない）
  const account = await loadAccountWithReset(userId, now);
  const action = creditAction("llm", "live");
  const gate = canRun({ balance: account.creditBalance, granted: 0 }, action);
  if (!gate.allowed) return fail(gate.reason ?? "クレジットが足りません", account.creditBalance);

  const brands = await listBrands(userId);
  const own = brands.find((b) => b.type === "own");
  if (!own) return fail("自社ブランドが登録されていません", account.creditBalance);

  const { normalizedHash } = await import("./normalize");
  const hash = await normalizedHash(promptText);
  const outcome = await provider.run({ kind: "llm", text: promptText, model, locale: defaultLocale(), mode: "live", signal: options.signal });
  if (!outcome.result) return fail(outcome.message ?? "計測に失敗しました", account.creditBalance);

  const citations = await resolveCitations(outcome.result.citations);
  const measurement = await saveMeasurement({
    kind: "llm",
    normalizedHash: hash,
    text: promptText,
    model,
    locale: defaultLocale(),
    executedAt: now.toISOString(),
    modelVersion: outcome.result.modelVersion,
    responseText: outcome.result.responseText,
    citations,
    rank: null,
    mode: "live",
    costUsd: outcome.result.costUsd ?? costUsd("llm", "live", unitPrices()),
  });

  const competitors = brands.filter((b) => b.type === "competitor");
  const hits = await judgeMentions(measurement.responseText, brands, { signal: options.signal });
  const rows: Omit<GeoObservation, "id">[] = brands.map((brand) => {
    const hit = hits.find((h) => h.brandId === brand.id);
    const citation = judgeCitation(citations, brand);
    return {
      measurementId: measurement.id,
      promptId: null,
      keywordId: null,
      brandId: brand.id,
      cited: citation.cited,
      mentioned: hit?.mentioned ?? false,
      mentionConfidence: hit?.confidence ?? 0,
      position: hit?.position ?? null,
      citedDomains: citation.domains,
      domainClass: citation.domains[0] ? classifyDomain(citation.domains[0], own, competitors) : null,
      observedAt: now.toISOString(),
    };
  });
  await saveObservations(userId, rows);

  const credits = creditCost(action);
  await recordCredit(userId, action, credits, measurement.id, false);
  const balance = await chargeBalance(userId, credits, now);

  return {
    ok: true,
    message: "実行しました",
    creditsUsed: credits,
    balance,
    responseText: measurement.responseText,
    citations: citations.map((c) => ({ url: c.url, domain: c.domain, unresolved: c.unresolved })),
    mentioned: brands.map((b) => {
      const hit = hits.find((h) => h.brandId === b.id);
      return { brandId: b.id, displayName: b.displayName, mentioned: hit?.mentioned ?? false, confidence: hit?.confidence ?? 0 };
    }),
  };
}

function fail(message: string, balance: number): LiveRunResult {
  return { ok: false, message, creditsUsed: 0, balance, responseText: "", citations: [], mentioned: [] };
}

/* ───────────── 業界の地図（LLM Mentions。#127） ───────────── */

export interface IndustryMapResult {
  ok: boolean;
  message: string;
  creditsUsed: number;
  balance: number;
  report: MentionsReport | null;
}

/**
 * 「業界の地図」を 1 回引く（オンデマンドのみ。定期実行には入れない）。
 *
 * 自社・競合のドメインは設定（/settings）から同期済みの geo_brands を使い、
 * 表の中で自社と競合に印を付ける。**残高が足りなければ引かない**（Live と同じ扱い）。
 * 失敗したときはクレジットを使わない（記帳もしない）。
 */
export async function runIndustryMap(
  userId: string,
  keyword: string,
  platform: MentionPlatform,
  options: { now?: Date; signal?: AbortSignal; limit?: number } = {},
): Promise<IndustryMapResult> {
  const now = options.now ?? new Date();
  if (!isDataForSeoConfigured()) return mapFail("DataForSEO が未設定です（DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD）", 0);

  const account = await loadAccountWithReset(userId, now);
  const action: CreditAction = "llm_mentions";
  const gate = canRun({ balance: account.creditBalance, granted: 0 }, action);
  if (!gate.allowed) return mapFail(gate.reason ?? "クレジットが足りません", account.creditBalance);

  const brands = await listBrands(userId);
  const outcome = await fetchTopDomains(
    {
      keyword,
      platform,
      limit: options.limit,
      brands: {
        own: brands.filter((b) => b.type === "own").flatMap((b) => b.domains),
        competitors: brands.filter((b) => b.type === "competitor").flatMap((b) => b.domains),
      },
    },
    { signal: options.signal },
  );
  // 取れなかったときはクレジットを使わない
  if (!outcome.report) return mapFail(outcome.message ?? "業界の地図を取得できませんでした", account.creditBalance);

  const credits = creditCost(action);
  await recordCredit(userId, action, credits, null, false);
  const balance = await chargeBalance(userId, credits, now);

  return {
    ok: true,
    message: `${outcome.report.rows.length} 件のドメインを取得しました（原価の目安 $${mentionsCostUsd(outcome.report.rows.length).toFixed(3)}）`,
    creditsUsed: credits,
    balance,
    report: outcome.report,
  };
}

function mapFail(message: string, balance: number): IndustryMapResult {
  return { ok: false, message, creditsUsed: 0, balance, report: null };
}
