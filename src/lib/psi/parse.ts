/**
 * PageSpeed Insights v5 のレスポンスを読む（純関数・ネットワークに出ない）。
 *
 * API の形は変わりうるので、どのフィールドも「無いかもしれない」前提で読む。
 * 欠けている値は null にし、画面側で「データなし」と出す（推測で埋めない）。
 */
import type { CruxCategory, CruxMetric, PsiAudit, PsiResult, PsiStrategy } from "./types";

/** 上位いくつの改善項目を出すか */
export const MAX_OPPORTUNITIES = 5;
/** これ未満のスコアを「改善余地あり」とみなす（docs §2.4） */
export const OPPORTUNITY_SCORE_MAX = 0.9;

type Json = Record<string, unknown>;

function obj(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** categories.performance.score は 0〜1。画面では 0〜100 で扱う */
function categoryScore(categories: Json | null, key: string): number | null {
  const category = obj(categories?.[key]);
  const score = num(category?.score);
  return score === null ? null : Math.round(score * 100);
}

function cruxCategory(value: unknown): CruxCategory {
  const raw = str(value).toUpperCase();
  return raw === "FAST" || raw === "AVERAGE" || raw === "SLOW" ? raw : "NONE";
}

function cruxMetric(metrics: Json | null, key: string, divisor = 1): CruxMetric | null {
  const metric = obj(metrics?.[key]);
  const percentile = num(metric?.percentile);
  if (percentile === null) return null;
  return { value: percentile / divisor, category: cruxCategory(metric?.category) };
}

/** audits.<id>.numericValue（ミリ秒 / スコア） */
function auditValue(audits: Json | null, id: string): number | null {
  return num(obj(audits?.[id])?.numericValue);
}

/**
 * 改善余地の大きい項目を score の低い順に集める。
 * score が null の項目（情報表示のみ・対象外）は除く。
 */
export function collectOpportunities(audits: Json | null, limit = MAX_OPPORTUNITIES): PsiAudit[] {
  if (!audits) return [];
  const rows: PsiAudit[] = [];
  for (const [id, raw] of Object.entries(audits)) {
    const audit = obj(raw);
    if (!audit) continue;
    const mode = str(audit.scoreDisplayMode);
    if (mode === "informative" || mode === "notApplicable" || mode === "manual") continue;
    const score = num(audit.score);
    if (score === null || score >= OPPORTUNITY_SCORE_MAX) continue;
    rows.push({
      id,
      title: str(audit.title) || id,
      score,
      displayValue: str(audit.displayValue),
      description: str(audit.description),
    });
  }
  return rows.sort((a, b) => a.score - b.score || a.id.localeCompare(b.id)).slice(0, limit);
}

export interface ParsePsiOptions {
  requestedUrl: string;
  strategy: PsiStrategy;
  usedApiKey: boolean;
  fetchedAt?: string;
}

/** レスポンス JSON → PsiResult */
export function parsePsi(raw: unknown, options: ParsePsiOptions): PsiResult {
  const root = obj(raw);
  const lighthouse = obj(root?.lighthouseResult);
  const audits = obj(lighthouse?.audits);
  const experience = obj(root?.loadingExperience) ?? obj(root?.originLoadingExperience);
  const metrics = obj(experience?.metrics);

  const crux = metrics
    ? {
        lcp: cruxMetric(metrics, "LARGEST_CONTENTFUL_PAINT_MS"),
        inp: cruxMetric(metrics, "INTERACTION_TO_NEXT_PAINT"),
        // CLS は 100 倍された整数で返る（0.12 → 12）
        cls: cruxMetric(metrics, "CUMULATIVE_LAYOUT_SHIFT_SCORE", 100),
      }
    : null;

  return {
    requestedUrl: str(lighthouse?.requestedUrl) || options.requestedUrl,
    finalUrl: str(lighthouse?.finalUrl) || str(lighthouse?.finalDisplayedUrl) || options.requestedUrl,
    strategy: options.strategy,
    fetchedAt: options.fetchedAt ?? str(lighthouse?.fetchTime) ?? new Date().toISOString(),
    categories: {
      performance: categoryScore(obj(lighthouse?.categories), "performance"),
      accessibility: categoryScore(obj(lighthouse?.categories), "accessibility"),
      seo: categoryScore(obj(lighthouse?.categories), "seo"),
    },
    crux: crux && (crux.lcp || crux.inp || crux.cls) ? crux : null,
    lab: {
      lcp: auditValue(audits, "largest-contentful-paint"),
      cls: auditValue(audits, "cumulative-layout-shift"),
      fcp: auditValue(audits, "first-contentful-paint"),
      tbt: auditValue(audits, "total-blocking-time"),
    },
    opportunities: collectOpportunities(audits),
    usedApiKey: options.usedApiKey,
  };
}

/** ミリ秒を「1.2 秒」の形にする（表示用） */
export function formatMs(value: number | null): string {
  if (value === null) return "—";
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(1)} 秒`;
}

/** CLS は小数第 3 位まで */
export function formatCls(value: number | null): string {
  return value === null ? "—" : value.toFixed(3);
}
