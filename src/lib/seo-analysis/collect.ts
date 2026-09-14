/**
 * パワーアップ分析の「収集」。サーバー専用。
 *
 * サイト診断（クロール + 48 ルール + 構成 + 信頼）→ クイック診断（トップ）→
 * 主要ページの PageSpeed / CrUX、検索順位（SerpApi）、Google 連携（任意）を
 * 集めて事実シートにする。AI はここでは呼ばない（別リクエスト。Vercel の
 * 実行時間の上限に収めるため）。ネットワークに出る経路は既存のクライアントだけ。
 */
import { analyzeFetched, fetchSiteFiles } from "@/lib/analyzer";
import { fetchText } from "@/lib/analyzer/fetch";
import { runAudit, type AuditProgress } from "@/lib/audit/run";
import type { AuditResult } from "@/lib/audit/types";
import { canonicalizeUrl } from "@/lib/crawl/url";
import { fetchCruxHistory, fetchCruxRecord, fetchCruxWithFallback, isCruxEnabled } from "@/lib/crux";
import { fetchPsi } from "@/lib/psi/client";
import { collectGoogle } from "./google";
import { collectSearch } from "./search";
import { buildFactSheet, pickKeyPages } from "./sheet/build";
import type { AnalysisInput, SeoFactSheet, SheetSite, SheetSpeed } from "./sheet/types";

/** PSI / CrUX を掛けるページ数（トップ + 5。利用者の決定 2026-09-13） */
export const KEY_PAGES = 6;

export type CollectStep = "crawl" | "quick" | "speed" | "search" | "google" | "sheet";

export interface CollectProgress {
  step: CollectStep;
  message: string;
  audit?: AuditProgress;
}

export interface CollectOptions {
  signal?: AbortSignal;
  onProgress?: (p: CollectProgress) => void;
}

export async function collectFactSheet(input: AnalysisInput, options: CollectOptions = {}): Promise<SeoFactSheet> {
  const emit = (step: CollectStep, message: string, audit?: AuditProgress) => options.onProgress?.({ step, message, audit });

  // 1. クロール（テクニカル・構成・信頼）
  emit("crawl", "サイトをクロールしています");
  const audit = await runAudit(input.url, {
    maxPages: input.maxPages,
    signal: options.signal,
    onProgress: (p) => emit("crawl", `クロール中（${p.fetched} ページ取得）`, p),
  });
  const entryUrl = canonicalizeUrl(audit.startUrl) ?? audit.startUrl;
  const homeRow = audit.pages.find((p) => p.url === entryUrl) ?? audit.pages[0];

  // 2. クイック診断（トップページの AIO 採点）
  emit("quick", "トップページを採点しています");
  const quick = await quickScore(audit);

  // 3〜5. 速度・検索・Google 連携は並行
  const keyPages = pickKeyPages(audit.pages, entryUrl, KEY_PAGES);
  emit("speed", `主要 ${keyPages.length} ページの速度を取得しています`);
  const [speed, searchOutcome, googleOutcome] = await Promise.all([
    collectSpeed(audit.origin, keyPages, options.signal),
    (async () => {
      emit("search", "検索結果を取得しています");
      return collectSearch({
        origin: audit.origin,
        keywords: input.keywords,
        competitors: input.competitors,
        brand: input.brand,
        homeTitle: homeRow?.title ?? null,
        region: input.region,
        signal: options.signal,
      });
    })(),
    (async () => {
      emit("google", "Google 連携のデータを確認しています");
      return collectGoogle(audit.origin);
    })(),
  ]);

  emit("sheet", "事実シートを組み立てています");
  return buildFactSheet({
    input,
    audit,
    quick,
    speed: speed.speed,
    search: searchOutcome.search,
    google: googleOutcome.google,
    coverage: {
      psi: speed.psi,
      crux: speed.crux,
      serp: searchOutcome.enabled,
      searchConsole: googleOutcome.searchConsole,
      ga4: googleOutcome.ga4,
    },
  });
}

async function quickScore(audit: AuditResult): Promise<SheetSite["quick"]> {
  try {
    const page = await fetchText(audit.startUrl);
    const siteFiles = await fetchSiteFiles(audit.origin);
    const result = analyzeFetched(page, siteFiles);
    return {
      score: result.overall,
      categories: result.categories.map((c) => ({ id: c.id, label: c.label, score: c.score })),
    };
  } catch {
    return null;
  }
}

async function collectSpeed(
  origin: string,
  keyPages: { url: string; label: string }[],
  signal?: AbortSignal,
): Promise<{ speed: SheetSpeed; psi: boolean; crux: boolean }> {
  const notes: string[] = [];
  const cruxEnabled = isCruxEnabled();
  if (!cruxEnabled) notes.push("実ユーザーの速度（CrUX）は取得していません（PAGESPEED_API_KEY か CRUX_API_KEY が未設定）");
  if (!process.env.PAGESPEED_API_KEY?.trim()) notes.push("PageSpeed Insights は API キー無しで呼んでいます（回数制限で取得できないことがあります）");

  const [psi, cruxOrigin, cruxHistory, cruxUrls] = await Promise.all([
    Promise.all(
      keyPages.map(async (p) => {
        const outcome = await fetchPsi(p.url, "mobile");
        return { url: p.url, label: p.label, result: outcome.result, error: outcome.error };
      }),
    ),
    cruxEnabled ? fetchCruxRecord({ origin }, { signal }) : null,
    cruxEnabled ? fetchCruxHistory({ origin }, { signal }) : null,
    cruxEnabled
      ? Promise.all(keyPages.map(async (p) => {
          const outcome = await fetchCruxWithFallback(p.url, { signal });
          return { url: p.url, record: outcome.result, failure: outcome.failure };
        }))
      : [],
  ]);

  if (cruxOrigin?.failure === "upstream" || cruxOrigin?.failure === "network") notes.push(cruxOrigin.message ?? "CrUX の取得に失敗しました");
  const psiOk = psi.some((p) => p.result !== null);
  if (!psiOk) notes.push("PageSpeed Insights の結果を 1 件も取得できませんでした");

  return {
    speed: {
      psi,
      crux: {
        origin: cruxOrigin?.result ?? null,
        originFailure: cruxOrigin?.failure ?? null,
        history: cruxHistory?.result ?? null,
        urls: cruxUrls,
      },
      notes,
    },
    psi: psiOk,
    crux: cruxEnabled && (cruxOrigin?.result !== null || cruxUrls.some((u) => u.record !== null)),
  };
}
