/**
 * 無料診断レポートの導出層（純関数）。
 *
 * AnalysisResult / SiteAnalysisResult を、画面（src/components/free）が
 * そのまま描ける PageReportSummary / SiteReportSummary に変換する。
 * 規則は docs/dev/design-spec.md §3.4（見込み加点・優先改善 TOP3・講評 3 行）に従う。
 *
 * LLM もネットワークも React も使わない。Date.now() / Math.random() も使わず、
 * 日時は結果オブジェクトの値だけを見る（同じ入力からは必ず同じ出力になる）。
 */
import {
  CATEGORY_LABELS,
  CATEGORY_WEIGHTS,
  type AnalysisResult,
  type CategoryId,
  type CategoryScore,
  type CheckResult,
  type CheckStatus,
  type SiteAnalysisResult,
  type SiteCheckSummary,
  type SiteCrawlTruncation,
  type SitePageResult,
} from "@/lib/analyzer/types";
import { GRADE_BANDS, gradeOf, toneOf, type Grade, type GradeInfo } from "@/lib/ui/grade";
import { fmt, pathOf } from "./format";
import { CATEGORY_ORDER, categoryIndex, checkWeight } from "./weights";
import type {
  CategoryRow,
  CommentaryLine,
  CommentaryPart,
  Improvement,
  PageReportSummary,
  PriorityItem,
  RankedPage,
  ScoreBand,
  SiteReportSummary,
  StatusCounts,
} from "./types";

// ---------------------------------------------------------------------------
// 小さな道具
// ---------------------------------------------------------------------------

/** 深刻な順。並べ替えの副キーに使う */
const STATUS_SEVERITY: readonly CheckStatus[] = ["fail", "warn", "info", "pass"];

/** 判定 → 獲得率（analyzer/check.ts と同じ値。earned が欠けた入力の補完に使う） */
const EARN_RATIO: Record<CheckStatus, number> = { pass: 1, warn: 0.5, fail: 0, info: 0 };

function severityIndex(status: CheckStatus): number {
  const i = STATUS_SEVERITY.indexOf(status);
  return i === -1 ? STATUS_SEVERITY.length : i;
}

/** 0〜100 の整数に丸める（NaN・範囲外を潰す） */
function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, Math.round(value)));
}

/** 0 以上の有限な数にする */
function safeCount(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

/** 浮動小数の誤差で順位が入れ替わらないよう、比較前に丸める */
function gainKey(gain: number): number {
  return Math.round(gain * 1e6);
}

/** 講評に差し込む数値（画面側で tabular-nums の span に包む） */
function numPart(value: number): CommentaryPart {
  return { num: fmt(value) };
}

function emptyStatusMap(): Record<CheckStatus, number> {
  return { pass: 0, warn: 0, fail: 0, info: 0 };
}

function toStatusCounts(map: Record<CheckStatus, number>): StatusCounts {
  const pass = safeCount(map.pass);
  const warn = safeCount(map.warn);
  const fail = safeCount(map.fail);
  const info = safeCount(map.info);
  return { pass, warn, fail, info, scored: pass + warn + fail };
}

function categoryRow(
  id: CategoryId,
  score: number,
  extra?: { min?: number; max?: number; worstUrl?: string },
): CategoryRow {
  const value = clampScore(score);
  return {
    id,
    label: CATEGORY_LABELS[id] ?? id,
    score: value,
    weight: CATEGORY_WEIGHTS[id] ?? 0,
    tone: toneOf(value),
    grade: gradeOf(value),
    ...extra,
  };
}

/** 最高点のカテゴリ。同点は CATEGORY_ORDER の先頭（rows は CATEGORY_ORDER 順） */
function bestRow(rows: CategoryRow[]): CategoryRow {
  return rows.reduce((a, b) => (b.score > a.score ? b : a), rows[0]);
}

/** 最低点のカテゴリ。同点は CATEGORY_ORDER の先頭 */
function worstRow(rows: CategoryRow[]): CategoryRow {
  return rows.reduce((a, b) => (b.score < a.score ? b : a), rows[0]);
}

/** カテゴリが 1 つも無い（壊れた入力）ときの代用行 */
function fallbackRow(): CategoryRow {
  return categoryRow(CATEGORY_ORDER[0], 0);
}

/** 「+3 点」。四捨五入して 0 になるものは「+1 点未満」（design-spec §3.4） */
function gainLabelOf(gain: number): string {
  const rounded = Math.round(gain);
  return rounded > 0 ? `+${fmt(rounded)} 点` : "+1 点未満";
}

/** 優先改善の並び: 見込み加点 → 未対応優先 → 全ページ共通優先 → CATEGORY_ORDER → id */
function compareImprovements(a: Improvement, b: Improvement): number {
  return (
    gainKey(b.gain) - gainKey(a.gain) ||
    severityIndex(a.status) - severityIndex(b.status) ||
    spreadIndex(a.spread) - spreadIndex(b.spread) ||
    categoryIndex(a.category) - categoryIndex(b.category) ||
    a.id.localeCompare(b.id)
  );
}

function spreadIndex(spread: "uniform" | "mixed" | undefined): number {
  return spread === "mixed" ? 1 : 0;
}

// ---------------------------------------------------------------------------
// PAGE モード
// ---------------------------------------------------------------------------

/** 未獲得の配点（合格にしたときに増える分） */
function missingWeight(check: CheckResult): number {
  const weight = Number.isFinite(check.weight) ? Math.max(0, check.weight) : 0;
  const earned = Number.isFinite(check.earned) ? check.earned : weight * EARN_RATIO[check.status];
  return Math.max(0, weight - earned);
}

/**
 * 項目 c を合格にしたときの総合スコアの増分。
 * gain = (weight − earned) / Σweight(k) × CATEGORY_WEIGHTS[k]（design-spec §3.4）
 */
function pageImprovements(categories: CategoryScore[]): Improvement[] {
  const list: Improvement[] = [];
  for (const category of categories) {
    const id = category.id;
    const checks = category.checks ?? [];
    const total = checks.reduce(
      (sum, c) => sum + (Number.isFinite(c.weight) ? Math.max(0, c.weight) : 0),
      0,
    );
    const categoryWeight = CATEGORY_WEIGHTS[id] ?? 0;
    for (const c of checks) {
      if (c.status !== "fail" && c.status !== "warn") continue;
      const gain = total > 0 ? (missingWeight(c) / total) * categoryWeight : 0;
      list.push({
        id: c.id,
        label: c.label,
        category: id,
        categoryLabel: CATEGORY_LABELS[id] ?? id,
        status: c.status,
        gain,
        gainLabel: gainLabelOf(gain),
        evidence: c.evidence,
        advice: c.advice,
      });
    }
  }
  return list.sort(compareImprovements);
}

/** ページ 1 枚分のレポートサマリー */
export function buildPageSummary(result: AnalysisResult): PageReportSummary {
  const categories = result.categories ?? [];
  const checks = categories.flatMap((c) => c.checks ?? []);

  const map = emptyStatusMap();
  for (const c of checks) {
    if (c.status in map) map[c.status] += 1;
  }
  const counts = toStatusCounts(map);

  const scoreById = new Map<CategoryId, number>();
  for (const c of categories) scoreById.set(c.id, c.score);
  const rows = CATEGORY_ORDER.filter((id) => scoreById.has(id)).map((id) =>
    categoryRow(id, scoreById.get(id) ?? 0),
  );

  const overall = clampScore(result.overall);
  const grade = gradeOf(overall);
  const improvements = pageImprovements(categories);
  const top3 = improvements.slice(0, 3);
  const projected = clampScore(overall + top3.reduce((sum, i) => sum + i.gain, 0));
  const projectedGrade = gradeOf(projected);
  const best = rows.length > 0 ? bestRow(rows) : fallbackRow();
  const worst = rows.length > 0 ? worstRow(rows) : fallbackRow();

  return {
    mode: "page",
    overall,
    grade,
    counts,
    categories: rows,
    best,
    worst,
    improvements,
    top3,
    projected,
    projectedGrade,
    commentary: buildCommentary({
      mode: "page",
      overall,
      grade,
      categories: rows,
      best,
      worst,
      counts,
      top3,
      projected,
      projectedGrade,
    }),
    failedLabels: improvements.filter((i) => i.status === "fail").map((i) => i.label),
  };
}

// ---------------------------------------------------------------------------
// SITE モード
// ---------------------------------------------------------------------------

/**
 * 項目の広がり。
 * 「全ページ共通（テンプレートを 1 箇所直せば全ページ直る）」と言えるのは、
 * 判定が 1 種類しか無く、かつ全ページで評価された項目だけ。
 * （JSON-LD の文法エラーのように、一部のページにしか現れない項目がある）
 */
function spreadOf(counts: Record<CheckStatus, number>, pageCount: number): "uniform" | "mixed" {
  const present = STATUS_SEVERITY.filter((s) => safeCount(counts[s]) > 0);
  const total = STATUS_SEVERITY.reduce((sum, s) => sum + safeCount(counts[s]), 0);
  if (present.length > 1) return "mixed";
  return pageCount === 0 || total >= pageCount ? "uniform" : "mixed";
}

/** 最も深刻な判定 */
function worstStatusOf(counts: Record<CheckStatus, number>): CheckStatus {
  return STATUS_SEVERITY.find((s) => safeCount(counts[s]) > 0) ?? "pass";
}

/** カテゴリごとの配点合計（CHECK_WEIGHTS の写しから。同じ id は 1 度だけ数える） */
function categoryTotals(checks: SiteCheckSummary[]): Map<CategoryId, number> {
  const totals = new Map<CategoryId, number>();
  const seen = new Set<string>();
  for (const c of checks) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    totals.set(c.category, (totals.get(c.category) ?? 0) + checkWeight(c.id));
  }
  return totals;
}

/**
 * サイトの見込み加点（design-spec §3.4）:
 * gain = (weight × fail + 0.5 × weight × warn) / N / Σweight(k) × CATEGORY_WEIGHTS[k]
 */
function siteImprovements(checks: SiteCheckSummary[], pageCount: number): Improvement[] {
  const totals = categoryTotals(checks);
  const list: Improvement[] = [];
  for (const c of checks) {
    const counts = c.counts ?? emptyStatusMap();
    const fail = safeCount(counts.fail);
    const warn = safeCount(counts.warn);
    if (fail === 0 && warn === 0) continue;
    const weight = checkWeight(c.id);
    const total = totals.get(c.category) ?? 0;
    const categoryWeight = CATEGORY_WEIGHTS[c.category] ?? 0;
    const missing = weight * fail + 0.5 * weight * warn;
    const gain =
      pageCount > 0 && total > 0 ? (missing / pageCount / total) * categoryWeight : 0;
    const affected = (c.affected ?? []).filter((a) => a.status === "fail" || a.status === "warn");
    const status: CheckStatus = fail > 0 ? "fail" : "warn";
    list.push({
      id: c.id,
      label: c.label,
      category: c.category,
      categoryLabel: CATEGORY_LABELS[c.category] ?? c.category,
      status,
      gain,
      gainLabel: gainLabelOf(gain),
      evidence: affected.find((a) => a.status === status)?.evidence,
      advice: c.advice,
      affectedPages: fail + warn,
      affectedCount: fail + warn,
      affectedUrls: affected
        .slice()
        .sort((a, b) => severityIndex(a.status) - severityIndex(b.status) || a.url.localeCompare(b.url))
        .map((a) => a.url),
      totalPages: pageCount,
      spread: spreadOf(counts, pageCount),
    });
  }
  return list.sort(compareImprovements);
}

/**
 * 改善提案（詳細）の一覧。全ページ共通（uniform）とページ差（mixed）を
 * 1 本のリストにまとめる。画面側は spread で 2 群に分けて描く（design-spec §3.3-5）。
 * 全ページ合格の項目は除き、参考（info）だけの任意項目は worst = "info" で残す。
 */
function sitePriorities(checks: SiteCheckSummary[], pageCount: number): PriorityItem[] {
  const list: PriorityItem[] = [];
  for (const c of checks) {
    const counts = c.counts ?? emptyStatusMap();
    const normalized: Record<CheckStatus, number> = {
      pass: safeCount(counts.pass),
      warn: safeCount(counts.warn),
      fail: safeCount(counts.fail),
      info: safeCount(counts.info),
    };
    const worst = worstStatusOf(normalized);
    if (worst === "pass") continue; // 全ページ合格の項目は改善提案に出さない
    const weight = checkWeight(c.id);
    list.push({
      id: c.id,
      label: c.label,
      category: c.category,
      categoryLabel: CATEGORY_LABELS[c.category] ?? c.category,
      weight,
      counts: normalized,
      spread: spreadOf(normalized, pageCount),
      worst,
      affectedCount: normalized.fail + normalized.warn + normalized.info,
      totalPages: pageCount,
      affected: (c.affected ?? [])
        .slice()
        .sort((a, b) => severityIndex(a.status) - severityIndex(b.status) || a.url.localeCompare(b.url)),
      advice: c.advice,
      priority: normalized.fail * weight,
      secondary: normalized.warn * weight,
    });
  }
  return list.sort(
    (a, b) =>
      b.priority - a.priority ||
      b.secondary - a.secondary ||
      b.affectedCount - a.affectedCount ||
      spreadIndex(a.spread) - spreadIndex(b.spread) ||
      categoryIndex(a.category) - categoryIndex(b.category) ||
      a.id.localeCompare(b.id),
  );
}

/** ページ別スコア分布（E → A の順） */
function scoreBands(scores: number[]): ScoreBand[] {
  const counts = new Map<Grade, number>();
  for (const s of scores) {
    const g = gradeOf(s).grade;
    counts.set(g, (counts.get(g) ?? 0) + 1);
  }
  return GRADE_BANDS.map((band) => gradeOf(band.min))
    .map((info) => ({
      grade: info.grade,
      label: info.label,
      range: `${info.min}–${info.max}`,
      min: info.min,
      max: info.max,
      count: counts.get(info.grade) ?? 0,
      color: info.color,
    }))
    .reverse();
}

/** 区分の中での位置（ヒストグラムの横方向 0〜1）。平均点の縦線に使う */
function bandFraction(score: number, bands: ScoreBand[]): number {
  if (bands.length === 0) return 0;
  const found = bands.findIndex((b) => score >= b.min && score <= b.max);
  const index = found === -1 ? (score < bands[0].min ? 0 : bands.length - 1) : found;
  const band = bands[index];
  const span = band.max - band.min + 1;
  const within = span > 0 ? Math.min(1, Math.max(0, (score - band.min) / span)) : 0;
  return (index + within) / bands.length;
}

function medianOf(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** www・末尾スラッシュ・スキームの違いを吸収して同じページかを判定する */
function sameTarget(a: string, b: string): boolean {
  const normalize = (value: string): string => {
    try {
      const url = new URL(value);
      return `${url.hostname.replace(/^www\./, "")}${url.pathname.replace(/\/+$/, "")}${url.search}`;
    } catch {
      return value.replace(/\/+$/, "");
    }
  };
  return normalize(a) === normalize(b);
}

interface PageEntry {
  page: SitePageResult;
  index: number;
  score: number;
  isEntry: boolean;
}

function toRankedPage(entry: PageEntry, rank: number): RankedPage {
  const scores = Object.fromEntries(
    CATEGORY_ORDER.map((id) => [id, clampScore(entry.page.scores?.[id] ?? 0)]),
  ) as Record<CategoryId, number>;
  return {
    rank,
    url: entry.page.url,
    path: pathOf(entry.page.url),
    overall: entry.score,
    grade: gradeOf(entry.score),
    scores,
    isEntry: entry.isEntry,
  };
}

/** ページが 1 枚も無い（壊れた入力）ときの代用行 */
function fallbackPage(url: string): RankedPage {
  const scores = Object.fromEntries(CATEGORY_ORDER.map((id) => [id, 0])) as Record<
    CategoryId,
    number
  >;
  return { rank: 1, url, path: pathOf(url), overall: 0, grade: gradeOf(0), scores, isEntry: true };
}

/** カテゴリ別スコア。集計が欠けていればページから作り直す */
function siteCategoryRows(result: SiteAnalysisResult): CategoryRow[] {
  const pages = result.pages ?? [];
  const byId = new Map((result.categories ?? []).map((c) => [c.id, c]));
  const rows: CategoryRow[] = [];
  for (const id of CATEGORY_ORDER) {
    const summary = byId.get(id);
    if (summary) {
      rows.push(
        categoryRow(id, summary.score, {
          min: clampScore(summary.min),
          max: clampScore(summary.max),
          worstUrl: summary.worstUrl,
        }),
      );
      continue;
    }
    if (pages.length === 0) continue;
    const scored = pages.map((p) => ({ url: p.url, score: clampScore(p.scores?.[id] ?? 0) }));
    const worst = scored.reduce((a, b) => (b.score < a.score ? b : a));
    const sum = scored.reduce((acc, s) => acc + s.score, 0);
    rows.push(
      categoryRow(id, sum / scored.length, {
        min: Math.min(...scored.map((s) => s.score)),
        max: Math.max(...scored.map((s) => s.score)),
        worstUrl: worst.url,
      }),
    );
  }
  return rows;
}

/** サイト全体（全ページ）のレポートサマリー */
export function buildSiteSummary(result: SiteAnalysisResult): SiteReportSummary {
  const pages = result.pages ?? [];
  const checks = result.checks ?? [];
  const pageCount = pages.length;

  const entryIndex = Math.max(
    0,
    pages.findIndex((p) => sameTarget(p.url, result.entryUrl)),
  );
  const entries: PageEntry[] = pages.map((page, index) => ({
    page,
    index,
    score: clampScore(page.overall),
    isEntry: index === entryIndex,
  }));
  // 入力 URL は先頭固定、残りは総合の低い順（同点は取得順）
  const display = [...entries].sort(
    (a, b) =>
      Number(b.isEntry) - Number(a.isEntry) || a.score - b.score || a.index - b.index,
  );
  const rankedPages = display.map((entry, i) => toRankedPage(entry, i + 1));

  const overall = clampScore(result.overall);
  const grade = gradeOf(overall);
  const rows = siteCategoryRows(result);
  const best = rows.length > 0 ? bestRow(rows) : fallbackRow();
  const worst = rows.length > 0 ? worstRow(rows) : fallbackRow();

  const map = emptyStatusMap();
  for (const c of checks) {
    for (const status of STATUS_SEVERITY) map[status] += safeCount(c.counts?.[status]);
  }
  const counts = toStatusCounts(map);

  const improvements = siteImprovements(checks, pageCount);
  const top3 = improvements.slice(0, 3);
  const projected = clampScore(overall + top3.reduce((sum, i) => sum + i.gain, 0));
  const projectedGrade = gradeOf(projected);

  const scores = entries.map((e) => e.score);
  const bands = scoreBands(scores);
  // 最もページ数が多い区分。同数のときは低い区分（bands は E → A の順）
  const modeBand = bands.reduce((a, b) => (b.count > a.count ? b : a), bands[0]);
  const uniformFailCount = checks.filter((c) => {
    const counts2 = c.counts ?? emptyStatusMap();
    return safeCount(counts2.fail) > 0 && spreadOf(counts2, pageCount) === "uniform";
  }).length;

  // 最高点・最低点のページ（入力 URL の先頭固定とは無関係。同点は取得順の先）
  const fallback = fallbackPage(result.entryUrl);
  const picked = display.map((entry, i) => ({ ...entry, ranked: rankedPages[i] }));
  const worstPage =
    picked.length > 0
      ? picked.reduce((a, b) =>
          b.score < a.score || (b.score === a.score && b.index < a.index) ? b : a,
        ).ranked
      : fallback;
  const bestPage =
    picked.length > 0
      ? picked.reduce((a, b) =>
          b.score > a.score || (b.score === a.score && b.index < a.index) ? b : a,
        ).ranked
      : fallback;

  return {
    mode: "site",
    overall,
    grade,
    counts,
    categories: rows,
    best,
    worst,
    improvements,
    top3,
    projected,
    projectedGrade,
    commentary: buildCommentary({
      mode: "site",
      overall,
      grade,
      categories: rows,
      best,
      worst,
      counts,
      top3,
      projected,
      projectedGrade,
      pageCount,
      uniformFailCount,
      truncated: result.crawl?.truncated ?? null,
    }),
    pageCount,
    bestPage,
    worstPage,
    bands,
    average: overall,
    median: medianOf(scores),
    modeBand,
    averageFraction: bandFraction(overall, bands),
    uniformFailCount,
    rankedPages,
    priorities: sitePriorities(checks, pageCount),
  };
}

// ---------------------------------------------------------------------------
// 講評（design-spec §3.4）
//
// 1 行目 現状 / 2 行目 課題 / 3 行目 方針。数値は { num } で分けて返し、
// 画面側で tabular-nums の span に包む。「危険」「致命的」などの断定語は使わない。
// 2 行目の単位だけは page と site で変える（page = 項目 / site = ページ × 項目の判定件数）。
// ---------------------------------------------------------------------------

interface CommentaryInput {
  mode: "page" | "site";
  overall: number;
  grade: GradeInfo;
  categories: CategoryRow[];
  best: CategoryRow;
  worst: CategoryRow;
  counts: StatusCounts;
  top3: Improvement[];
  projected: number;
  projectedGrade: GradeInfo;
  pageCount?: number;
  uniformFailCount?: number;
  truncated?: SiteCrawlTruncation | null;
}

function buildCommentary(input: CommentaryInput): CommentaryLine[] {
  const { mode, overall, grade, categories, best, worst, counts, top3 } = input;
  const isSite = mode === "site";
  const pageCount = input.pageCount ?? 1;

  if (isSite && pageCount === 0) {
    return [["診断できたページがありません。URL とサイトの公開状態をご確認ください。"]];
  }

  // 1 行目: 現状
  const current: CommentaryLine = [];
  if (isSite) {
    current.push(numPart(pageCount), pageCount > 1 ? " ページの平均で総合 " : " ページを診断し、総合 ");
  } else {
    current.push("総合 ");
  }
  current.push(numPart(overall), ` 点・${grade.grade}（${grade.label}）です。`);
  if (categories.length > 0) {
    current.push(
      numPart(categories.length),
      ` カテゴリで最も評価が高いのは${best.label}（`,
      numPart(best.score),
      " 点）です。",
    );
  }
  const truncated = input.truncated;
  if (isSite && truncated?.reason === "max-pages") {
    current.push(
      "上限 ",
      numPart(truncated.limit),
      " ページで打ち切ったため、",
      numPart(pageCount),
      " ページ分の集計です。",
    );
  } else if (isSite && truncated?.reason === "time-budget") {
    current.push("制限時間で打ち切ったため、", numPart(pageCount), " ページ分の集計です。");
  }

  // 端ケース: 判定が 1 つも無い（壊れた入力）
  if (counts.scored === 0 && counts.info === 0) {
    return [current, ["診断できた項目がありません。ページの取得結果をご確認ください。"]];
  }

  // 端ケース: 未対応も改善余地も無い（褒める）
  if (counts.fail === 0 && counts.warn === 0) {
    const praise: CommentaryLine = isSite
      ? [
          numPart(pageCount),
          " ページのすべてで主要項目を満たしています。未対応・改善余地のある判定はありません。",
        ]
      : ["主要項目はすべて満たしています。未対応・改善余地のある項目はありません。"];
    const next: CommentaryLine =
      counts.info > 0
        ? [
            "参考項目（",
            numPart(counts.info),
            " 件）に対応すると、さらに AI 検索への適合度を高められます。",
          ]
        : ["この水準を維持し、ページを追加するときも同じ基準で確認してください。"];
    return [current, praise, next];
  }

  // 2 行目: 課題。サイトで「全ページ共通の未対応」があればそちらを優先する
  const issue: CommentaryLine = [];
  const uniformFailCount = input.uniformFailCount ?? 0;
  // 「全ページ共通」はページが 2 枚以上あるときだけ意味を持つ
  if (isSite && pageCount > 1 && uniformFailCount > 0) {
    issue.push(
      "全 ",
      numPart(pageCount),
      " ページ共通の未対応が ",
      numPart(uniformFailCount),
      " 項目あり、テンプレートの修正で全ページに効果があります。",
    );
  } else {
    issue.push(`最も低いのは${worst.label}（`, numPart(worst.score), " 点）で、");
    const unit = isSite ? "件" : "項目";
    const tail = isSite ? "の判定があります。" : "があります。";
    if (counts.fail > 0 && counts.warn > 0) {
      issue.push(
        "未対応 ",
        numPart(counts.fail),
        ` ${unit}・改善余地 `,
        numPart(counts.warn),
        ` ${unit}${tail}`,
      );
    } else if (counts.fail > 0) {
      issue.push("未対応 ", numPart(counts.fail), ` ${unit}${tail}`);
    } else {
      issue.push("改善余地 ", numPart(counts.warn), ` ${unit}${tail}`);
    }
  }

  // 3 行目: 方針
  const plan: CommentaryLine = [];
  if (top3.length === 0) {
    plan.push("改善提案（詳細）の項目から順に対応すると、総合スコアの底上げが見込めます。");
  } else {
    if (top3.length >= 3) {
      plan.push("優先改善 TOP3 に対応すると、");
    } else {
      plan.push("優先改善の ", numPart(top3.length), " 項目に対応すると、");
    }
    if (input.projected > overall) {
      plan.push(
        "総合 ",
        numPart(input.projected),
        ` 点（${input.projectedGrade.grade}）まで改善が見込めます。`,
      );
    } else {
      plan.push("総合点の変化はわずかですが、AI クローラが内容を読み取りやすくなります。");
    }
  }

  return [current, issue, plan];
}
