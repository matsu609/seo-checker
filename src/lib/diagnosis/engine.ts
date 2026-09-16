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
import { COMMON_EVENTS, describeMapping, type CommonEvent } from "./events";
import { brandClickShare, changeOf, daysBetween, queryCoverage, shareOf } from "./metrics";
import { isBrandQuery, isHomePath, normalizeUrl, queryIntent, type QueryIntent } from "./normalize";
import { ALL_RULES } from "./rules";
import { thresholdsForGoal, THRESHOLDS_VERSION, type Thresholds } from "./thresholds";
import type {
  Confidence,
  DerivedMetrics,
  Ga4Derived,
  DiagnosisContext,
  DiagnosisResult,
  DiagnosisRule,
  DiagnosisSummary,
  Ga4Dataset,
  Ga4Summary,
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
    derived: derive(input.gsc, input.ga4, input.brandTerms),
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
    ga4: ga4SummaryOf(ctx),
  };
}

/* ───────────── 派生値（§7） ───────────── */

export function derive(gsc: GscDataset | null, ga4: Ga4Dataset | null, terms: readonly string[]): DerivedMetrics {
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
    ga4: deriveGa4(ga4),
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

  return {
    ...empty,
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

/** GA4 の派生値（§7）。共通イベントに寄せたセッション数から率を出す */
export function deriveGa4(ga4: Ga4Dataset | null): Ga4Derived | null {
  if (!ga4) return null;

  const zero = () => Object.fromEntries(COMMON_EVENTS.map((e) => [e, 0])) as Record<CommonEvent, number>;
  const eventSessions = zero();
  const eventCounts = zero();
  const isKeyEvent = Object.fromEntries(COMMON_EVENTS.map((e) => [e, false])) as Record<CommonEvent, boolean>;

  const byName = new Map(ga4.events.map((e) => [e.name, e]));
  for (const common of COMMON_EVENTS) {
    for (const name of ga4.mapping[common]) {
      const row = byName.get(name);
      if (!row) continue;
      // 同じ共通イベントに複数のイベント名が当たる場合、セッション数は足す。
      // 1 セッションで両方起きていると二重に数えるので、率は上限 1 で丸める
      eventSessions[common] += row.sessions;
      eventCounts[common] += row.count;
      if (row.keyEvents > 0) isKeyEvent[common] = true;
    }
  }

  const totals = ga4.totals;
  const engagementRate = {
    current: shareOf(totals.current.engagedSessions, totals.current.sessions),
    previous: shareOf(totals.previous.engagedSessions, totals.previous.sessions),
  };

  const organicOf = (rows: readonly { key: string; sessions: number }[]) => rows.filter((c) => c.key === ORGANIC_CHANNEL).reduce((acc, c) => acc + c.sessions, 0);
  const organicSessions = { current: organicOf(ga4.channels.current), previous: organicOf(ga4.channels.previous) };

  const organicComplete = ga4.channelEvents
    .filter((r) => r.channel === ORGANIC_CHANNEL && ga4.mapping.form_complete.includes(r.event))
    .reduce((acc, r) => acc + r.sessions, 0);

  const totalSessions = totals.current.sessions;
  const capped = (v: number | null) => (v === null ? null : Math.min(1, v));
  const direct = ga4.channels.current.filter((c) => c.key === "Direct").reduce((acc, c) => acc + c.sessions, 0);

  return {
    eventSessions,
    eventCounts,
    isKeyEvent,
    engagementRate,
    ctaClickRate: capped(shareOf(eventSessions.primary_cta, totalSessions)),
    formStartRate: capped(shareOf(eventSessions.form_start, eventSessions.primary_cta)),
    formCompletionRate: capped(shareOf(eventSessions.form_complete, eventSessions.form_start)),
    organicSessions,
    organicConversionRate: capped(shareOf(organicComplete, organicSessions.current)),
    channelShare: ga4.channels.current
      .map((c) => ({ channel: c.key, sessions: c.sessions, share: totalSessions > 0 ? c.sessions / totalSessions : 0 }))
      .sort((a, b) => b.sessions - a.sessions),
    directShare: shareOf(direct, totalSessions),
  };
}

/** GA4 の既定チャネルグループ名（英語で返る） */
export const ORGANIC_CHANNEL = "Organic Search";

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

function ga4SummaryOf(ctx: DiagnosisContext): Ga4Summary | null {
  const g = ctx.ga4;
  const d = ctx.derived.ga4;
  if (!g || !d) return null;
  return {
    propertyId: g.propertyId,
    range: g.range.current,
    sessions: g.totals.current.sessions,
    users: g.totals.current.users,
    engagementRate: d.engagementRate.current,
    organicSessions: d.organicSessions.current,
    ctaSessions: d.eventSessions.primary_cta,
    formStartSessions: d.eventSessions.form_start,
    formCompleteSessions: d.eventSessions.form_complete,
    ctaClickRate: d.ctaClickRate,
    formStartRate: d.formStartRate,
    formCompletionRate: d.formCompletionRate,
    organicConversionRate: d.organicConversionRate,
    mappingLines: describeMapping(g.mapping),
    unmapped: g.unmapped,
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
  } else {
    const mapping = ctx.ga4.mapping;
    if (mapping.primary_cta.length === 0) out.push("問い合わせ導線のクリックに当たる GA4 イベントが無いため、CTA クリック率は出していません");
    if (mapping.form_start.length === 0) out.push("フォーム入力開始に当たる GA4 イベントが無いため、フォーム開始率は出していません");
    if (mapping.form_complete.length === 0) out.push("問い合わせ完了に当たる GA4 イベントが無いため、問い合わせ率（CVR）は出していません");
    for (const n of ctx.ga4.notes) out.push(n);
  }
  out.push("CRM・営業データが無いため、商談化・受注への貢献は判定していません");
  return out;
}
