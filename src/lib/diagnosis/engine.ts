/**
 * ルールエンジン（docs/dev/diagnosis-rules-spec.md §2・§15）。純関数。
 *
 * ここがやるのは 3 つだけ。
 * 1. 派生値（§7 の計算）を作る
 * 2. 全ルールに順番に evaluate させる
 * 3. 発火したものに優先度スコアを付けて並べる
 *
 * ルールの中身（条件・原因候補・打ち手）は rules/ の宣言に閉じているので、
 * ルールを足してもこのファイルは変わらない。
 */
import type { AnalysisGoal } from "@/lib/seo-analysis/sheet/types";
import { brandClickShare, changeOf, daysBetween, queryCoverage, shareOf } from "./metrics";
import { isBrandQuery, isHomePath, normalizeUrl, queryIntent, type QueryIntent } from "./normalize";
import { ALL_RULES } from "./rules";
import { thresholdsForGoal, THRESHOLDS_VERSION, type Thresholds } from "./thresholds";
import type {
  Confidence,
  DerivedMetrics,
  DiagnosisContext,
  DiagnosisResult,
  DiagnosisRule,
  DiagnosisSummary,
  Ga4Dataset,
  GscDataset,
  RuleSeverity,
  TriggeredRule,
} from "./types";

/** ルール一式の版。ルールを足したり条件を変えたら上げる（§20 の再現性） */
export const RULES_VERSION = 1;

/** §15 の score_mapping */
const SEVERITY_SCORE: Record<RuleSeverity, number> = { critical: 4, high: 3, medium: 2, low: 1 };
const CONFIDENCE_SCORE: Record<Confidence, number> = { high: 1.0, medium: 0.7, low: 0.4 };
const EFFORT_SCORE = { small: 1, medium: 2, large: 3 } as const;

/** 優先度スコア = 重要度 × 影響量 × 確度 ÷ 実装負担 */
export function priorityScore(args: { severity: RuleSeverity; confidence: Confidence; impact: number; effort: keyof typeof EFFORT_SCORE }): number {
  return (SEVERITY_SCORE[args.severity] * args.impact * CONFIDENCE_SCORE[args.confidence]) / EFFORT_SCORE[args.effort];
}

export interface RunDiagnosisInput {
  origin: string;
  goal: AnalysisGoal;
  brandTerms: string[];
  targetCountries?: string[];
  gsc: GscDataset | null;
  ga4: Ga4Dataset | null;
  thresholdOverrides?: Partial<Thresholds>;
  rules?: readonly DiagnosisRule[];
  generatedAt?: string;
}

export function runDiagnosis(input: RunDiagnosisInput): DiagnosisResult {
  const thresholds = thresholdsForGoal(input.goal, input.thresholdOverrides);
  const ctx: DiagnosisContext = {
    thresholds,
    origin: input.origin,
    goal: input.goal,
    targetCountries: input.targetCountries ?? ["JPN"],
    brandTerms: input.brandTerms,
    gsc: input.gsc,
    ga4: input.ga4,
    derived: derive(input.gsc, input.brandTerms, thresholds),
  };

  const triggered: TriggeredRule[] = [];
  for (const rule of input.rules ?? ALL_RULES) {
    let outcome;
    try {
      outcome = rule.evaluate(ctx);
    } catch {
      // 1 つのルールの不具合で診断全体を止めない
      continue;
    }
    if (!outcome) continue;
    const confidence = outcome.confidence ?? rule.defaultConfidence;
    triggered.push({
      id: rule.id,
      category: rule.category,
      name: rule.name,
      severity: rule.severity,
      confidence,
      evidence: outcome.evidence,
      fact: rule.fact,
      possibleCauses: rule.possibleCauses,
      requiredChecks: rule.requiredChecks,
      recommendedActions: rule.recommendedActions,
      prohibitedConclusions: rule.prohibitedConclusions,
      effort: rule.effort,
      subjects: outcome.subjects ?? [],
      priority: priorityScore({ severity: rule.severity, confidence, impact: outcome.impact ?? 0.5, effort: rule.effort }),
    });
  }
  triggered.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));

  return {
    rulesVersion: RULES_VERSION,
    thresholdsVersion: THRESHOLDS_VERSION,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    period: {
      current: input.gsc?.range.current ?? null,
      previous: input.gsc?.range.previous ?? null,
      daysCurrent: ctx.derived.daysCurrent,
      daysPrevious: ctx.derived.daysPrevious,
    },
    triggered,
    limitations: limitationsOf(ctx),
    summary: summaryOf(ctx),
  };
}

/* ───────────── 派生値（§7） ───────────── */

export function derive(gsc: GscDataset | null, terms: readonly string[], thresholds: Thresholds): DerivedMetrics {
  const empty: DerivedMetrics = {
    daysCurrent: 0,
    daysPrevious: 0,
    queryCoverage: null,
    brandClickShare: null,
    nonBrandClicks: { current: 0, previous: 0 },
    brandClicks: { current: 0, previous: 0 },
    queryClicks: { current: 0, previous: 0 },
    byIntent: [],
    homepageClickShare: null,
    foreignImpressionShare: null,
  };
  if (!gsc) return empty;

  const sumClicks = (rows: readonly { clicks: number }[]) => rows.reduce((acc, r) => acc + r.clicks, 0);
  const brandOf = (rows: readonly { key: string; clicks: number }[]) => rows.filter((r) => isBrandQuery(r.key, terms)).reduce((acc, r) => acc + r.clicks, 0);

  const queryClicks = { current: sumClicks(gsc.queries.current), previous: sumClicks(gsc.queries.previous) };
  const brandClicks = { current: brandOf(gsc.queries.current), previous: brandOf(gsc.queries.previous) };

  const intents = new Map<QueryIntent, { clicks: number; impressions: number; queries: number }>();
  for (const row of gsc.queries.current) {
    const intent = queryIntent(row.key);
    const entry = intents.get(intent) ?? { clicks: 0, impressions: 0, queries: 0 };
    entry.clicks += row.clicks;
    entry.impressions += row.impressions;
    entry.queries += 1;
    intents.set(intent, entry);
  }

  const homeClicks = gsc.pages.current
    .filter((p) => {
      const n = normalizeUrl(p.key);
      return n !== null && isHomePath(n.path);
    })
    .reduce((acc, p) => acc + p.clicks, 0);

  const foreignImpressions = gsc.countries.current.filter((c) => !isTargetCountry(c.key)).reduce((acc, c) => acc + c.impressions, 0);
  const totalCountryImpressions = gsc.countries.current.reduce((acc, c) => acc + c.impressions, 0);

  void thresholds;
  return {
    daysCurrent: daysBetween(gsc.range.current.startDate, gsc.range.current.endDate),
    daysPrevious: daysBetween(gsc.range.previous.startDate, gsc.range.previous.endDate),
    queryCoverage: queryCoverage(queryClicks.current, gsc.totals.current.clicks),
    brandClickShare: brandClickShare(brandClicks.current, queryClicks.current),
    nonBrandClicks: { current: queryClicks.current - brandClicks.current, previous: queryClicks.previous - brandClicks.previous },
    brandClicks,
    queryClicks,
    byIntent: [...intents.entries()].map(([intent, v]) => ({ intent, ...v })).sort((a, b) => b.clicks - a.clicks),
    homepageClickShare: shareOf(homeClicks, gsc.totals.current.clicks),
    foreignImpressionShare: shareOf(foreignImpressions, totalCountryImpressions),
  };
}

/** 既定の対象国（日本）。目的別の市場設定が入ったら差し替える */
function isTargetCountry(code: string): boolean {
  return code.toLowerCase() === "jpn";
}

/* ───────────── 母数と制限事項 ───────────── */

function summaryOf(ctx: DiagnosisContext): DiagnosisSummary | null {
  const gsc = ctx.gsc;
  if (!gsc) return null;
  const clicks = changeOf(gsc.totals.current.clicks, gsc.totals.previous.clicks);
  const impressions = changeOf(gsc.totals.current.impressions, gsc.totals.previous.impressions);
  const ctr = changeOf(gsc.totals.current.ctr, gsc.totals.previous.ctr);
  return {
    siteUrl: gsc.siteUrl,
    totals: gsc.totals,
    clicksChangeRate: clicks.rate,
    impressionsChangeRate: impressions.rate,
    ctrChangeRate: ctr.rate,
    positionDiff: gsc.totals.current.position - gsc.totals.previous.position,
    queryCoverage: ctx.derived.queryCoverage,
    brandClickShare: ctx.derived.brandClickShare,
  };
}

/** 何が無くて判定できなかったか（§13 の limitations） */
function limitationsOf(ctx: DiagnosisContext): string[] {
  const out: string[] = [];
  if (!ctx.gsc) {
    out.push("Search Console と連携していないため、検索での露出・クリック・順位に関する診断（約 70 件）はすべて判定していません");
  } else {
    if (ctx.derived.queryCoverage !== null && ctx.derived.queryCoverage < ctx.thresholds.lowQueryCoverage) {
      out.push(`クエリ取得率が ${Math.round(ctx.derived.queryCoverage * 100)}% のため、指名検索比率などは「一覧に出たクエリの中での比率」としてのみ扱っています`);
    }
    if (ctx.gsc.appearances === null) out.push("「検索での見え方」を取得できていないため、リッチリザルトに関する診断は判定していません");
    for (const n of ctx.gsc.notes) out.push(n);
  }
  if (!ctx.ga4) {
    out.push("GA4 と連携していないため、訪問後の行動（閲覧・CTA・フォーム・計測）に関する診断は判定していません");
  }
  out.push("CRM・営業データが無いため、商談化・受注への貢献は判定していません");
  return out;
}
