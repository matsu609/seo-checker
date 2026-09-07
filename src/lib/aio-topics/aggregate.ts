/**
 * AIO 頻出トピックの集計（純関数）。
 *
 * docs/reference/04_implementation-guide.md §15.1 の 4〜6 に対応する。
 * 出現の割合・前期比・傾向・優先度（1〜5）をここだけで決め、画面は表示に徹する。
 */
import { palette } from "@/lib/ui/palette";
import type { TopicEntry } from "./normalize";

/** 自社ページのカバー状況 */
export type Coverage = "full" | "partial" | "none";

export const COVERAGE_LABELS: Record<Coverage, string> = {
  full: "記載あり",
  partial: "一部のみ",
  none: "記載なし",
};

/** 未カバー係数（§15.1 の 6）。full ほど優先度が下がる */
export const COVERAGE_FACTOR: Record<Coverage, number> = { none: 1, partial: 0.5, full: 0.1 };

/** 判定していないトピックは「未判定」= none と同じ重みで扱う（見落としを防ぐ） */
export const UNJUDGED_FACTOR = 1;

/** 優先度の色（1 が最も低い）。palette の hex を使う */
export const PRIORITY_COLORS: Record<number, string> = {
  5: palette.fail,
  4: palette.grade.D,
  3: palette.warn,
  2: palette.info,
  1: palette.muted,
};

export interface AioTopicDay {
  /** 対象キーワード */
  keyword: string;
  /** YYYY-MM-DD */
  takenOn: string;
  /** その日 AI Overviews が出ていたか */
  aioPresent: boolean;
  /** その日 AIO に自社が引用されていたか */
  selfCited: boolean;
  /** その日出現したトピック ID */
  topicIds: string[];
  /** 抽出の根拠（トピック ID -> AIO 本文の該当部分） */
  evidence?: Record<string, string>;
}

export interface TopicRow {
  topicId: string;
  label: string;
  /** 出現日数 */
  appearances: number;
  /** 出現の割合 = 出現日数 / AIO 表示日数（0〜1） */
  share: number;
  /** 前期間の出現割合。前期間が無ければ null */
  prevShare: number | null;
  /** 前期比（割合の差。+0.22 = 22 ポイント増） */
  shareDelta: number | null;
  /** 出現の傾向（スパークライン用の割合の列） */
  trend: number[];
  /** 傾向係数（-1〜1）。後半の出現割合 - 前半の出現割合 */
  trendFactor: number;
  coverage: Coverage | null;
  /** 優先度スコア（生値） */
  score: number;
  /** 優先度 1〜5 */
  priority: number;
}

export interface TopicAggregate {
  rows: TopicRow[];
  /** 観測した日数（AIO の有無に関わらず） */
  totalDays: number;
  /** AIO が表示された日数 */
  aioDays: number;
  /** AIO 表示率 = aioDays / totalDays */
  presenceRate: number;
  /** 自社サイトの引用率 = 自社引用日数 / aioDays */
  citationRate: number;
  /** 前期間の引用率（比較できなければ null） */
  prevCitationRate: number | null;
}

function ratio(part: number, total: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(total) || total <= 0) return 0;
  return part / total;
}

/** 観測日（昇順・重複なし） */
export function observedDates(days: readonly AioTopicDay[]): string[] {
  return Array.from(new Set(days.map((d) => d.takenOn))).sort((a, b) => a.localeCompare(b));
}

export interface PeriodSplit {
  /** 今期の観測 */
  currentDays: AioTopicDay[];
  /** 前期の観測（前期比が出せないときは空） */
  previousDays: AioTopicDay[];
}

/**
 * 直近 count 日を「今期」、その手前の count 日を「前期」にする。
 * count 未指定なら全期間を今期にして前期は空（前期比は出さない）。
 */
export function splitByPeriod(days: readonly AioTopicDay[], count?: number): PeriodSplit {
  const dates = observedDates(days);
  if (!count || count <= 0 || dates.length === 0) return { currentDays: [...days], previousDays: [] };
  const currentDates = new Set(dates.slice(-count));
  const previousDates = new Set(dates.slice(Math.max(0, dates.length - count * 2), Math.max(0, dates.length - count)));
  return {
    currentDays: days.filter((d) => currentDates.has(d.takenOn)),
    previousDays: days.filter((d) => previousDates.has(d.takenOn)),
  };
}

/** 期間内で AIO が表示された日（昇順） */
function aioDates(days: readonly AioTopicDay[]): AioTopicDay[] {
  return days.filter((d) => d.aioPresent).sort((a, b) => a.takenOn.localeCompare(b.takenOn));
}

/** 出現割合の推移（buckets 個の区間に等分して各区間の割合を出す） */
export function trendSeries(days: readonly AioTopicDay[], topicId: string, buckets = 6): number[] {
  const present = aioDates(days);
  if (present.length === 0) return [];
  const size = Math.max(1, Math.min(buckets, present.length));
  const out: number[] = [];
  for (let i = 0; i < size; i += 1) {
    const from = Math.floor((present.length * i) / size);
    const to = Math.floor((present.length * (i + 1)) / size);
    const slice = present.slice(from, Math.max(to, from + 1));
    const hit = slice.filter((d) => d.topicIds.includes(topicId)).length;
    out.push(ratio(hit, slice.length));
  }
  return out;
}

/** 傾向係数。後半の出現割合 - 前半の出現割合（-1〜1） */
export function trendFactor(days: readonly AioTopicDay[], topicId: string): number {
  const present = aioDates(days);
  if (present.length < 2) return 0;
  const half = Math.floor(present.length / 2);
  const early = present.slice(0, half);
  const late = present.slice(present.length - half);
  const earlyShare = ratio(early.filter((d) => d.topicIds.includes(topicId)).length, early.length);
  const lateShare = ratio(late.filter((d) => d.topicIds.includes(topicId)).length, late.length);
  return Math.max(-1, Math.min(1, lateShare - earlyShare));
}

/** 優先度スコア = 出現割合 x (1 + 傾向係数) x 未カバー係数 */
export function priorityScore(share: number, trend: number, coverage: Coverage | null): number {
  const factor = coverage ? COVERAGE_FACTOR[coverage] : UNJUDGED_FACTOR;
  const t = Math.max(-1, Math.min(1, Number.isFinite(trend) ? trend : 0));
  const s = Math.max(0, Math.min(1, Number.isFinite(share) ? share : 0));
  return s * (1 + t) * factor;
}

/**
 * スコアを 5 分位にして優先度 1〜5 にする（大きいほど優先）。スコア 0 は常に 1。
 *
 * 同点は「同点グループの中央の順位」で分位を引く。同じスコアの先頭順位で切ると、
 * 全件同スコア（AIO 本文が安定していてカバー未判定のときの典型）でも全件が 5 になり、
 * 優先順位づけとして機能しないため（§15.1 の 6）。差が付いていないときは中央の 3 に寄る。
 */
export function assignPriorities(scores: readonly number[]): number[] {
  // 0 点は「出現していない」なので分位の対象外（常に優先度 1）
  const positives = scores.filter((s) => s > 0).sort((a, b) => a - b);
  const total = positives.length;
  if (total === 0) return scores.map(() => 1);
  return scores.map((score) => {
    if (!(score > 0)) return 1;
    const less = positives.filter((s) => s < score).length;
    const equal = positives.filter((s) => s === score).length;
    // 同点グループの中央の順位（昇順・0 始まり）を、区間の中点として 0〜1 に写す
    const percentile = (less + (equal - 1) / 2 + 0.5) / total;
    return Math.max(1, Math.min(5, 1 + Math.floor(percentile * 5)));
  });
}

export interface AggregateInput {
  /** 今期の観測 */
  days: readonly AioTopicDay[];
  /** 前期の観測（前期比を出さないなら空） */
  previousDays?: readonly AioTopicDay[];
  topics: readonly TopicEntry[];
  /** トピック ID -> 自社ページのカバー状況 */
  coverage?: Readonly<Record<string, Coverage>>;
  /** スパークラインの点数 */
  buckets?: number;
}

/** トピック表の 1 枚分をまとめて作る */
export function aggregateTopics(input: AggregateInput): TopicAggregate {
  const days = [...input.days].sort((a, b) => a.takenOn.localeCompare(b.takenOn));
  const previousDays = input.previousDays ?? [];
  const present = aioDates(days);
  const prevPresent = aioDates(previousDays);
  const coverage = input.coverage ?? {};

  const base = input.topics.map((topic) => {
    const appearances = present.filter((d) => d.topicIds.includes(topic.id)).length;
    const share = ratio(appearances, present.length);
    const prevAppearances = prevPresent.filter((d) => d.topicIds.includes(topic.id)).length;
    const prevShare = prevPresent.length > 0 ? ratio(prevAppearances, prevPresent.length) : null;
    const trend = trendSeries(days, topic.id, input.buckets);
    const factor = trendFactor(days, topic.id);
    const cov = coverage[topic.id] ?? null;
    return {
      topicId: topic.id,
      label: topic.label,
      appearances,
      share,
      prevShare,
      shareDelta: prevShare === null ? null : share - prevShare,
      trend,
      trendFactor: factor,
      coverage: cov,
      score: priorityScore(share, factor, cov),
    };
  });

  const priorities = assignPriorities(base.map((r) => r.score));
  const rows: TopicRow[] = base
    .map((r, i) => ({ ...r, priority: priorities[i] }))
    .sort((a, b) => b.priority - a.priority || b.share - a.share || a.label.localeCompare(b.label, "ja"));

  const selfDays = present.filter((d) => d.selfCited).length;
  const prevSelfDays = prevPresent.filter((d) => d.selfCited).length;
  return {
    rows,
    totalDays: observedDates(days).length,
    aioDays: present.length,
    presenceRate: ratio(present.length, observedDates(days).length),
    citationRate: ratio(selfDays, present.length),
    prevCitationRate: prevPresent.length > 0 ? ratio(prevSelfDays, prevPresent.length) : null,
  };
}

/**
 * 不足トピック（自社ページに書かれていない / 一部しかない）。
 * ページ診断・AI ライティングに貼れるよう優先度の高い順で返す。
 */
export function missingTopics(rows: readonly TopicRow[], options: { includePartial?: boolean } = {}): TopicRow[] {
  const includePartial = options.includePartial ?? true;
  return rows
    .filter((r) => r.share > 0 && (r.coverage === "none" || r.coverage === null || (includePartial && r.coverage === "partial")))
    .sort((a, b) => b.priority - a.priority || b.share - a.share);
}

/** 不足トピックのコピー用テキスト（ページ診断・AI ライティングへの引き継ぎ） */
export function missingTopicsText(keyword: string, rows: readonly TopicRow[]): string {
  const lines = [`キーワード「${keyword}」の AI Overviews に頻出するが自社ページに不足しているトピック`];
  for (const r of rows) {
    const share = `${Math.round(r.share * 100)}%`;
    const cov = r.coverage ? COVERAGE_LABELS[r.coverage] : "未判定";
    lines.push(`- ${r.label}（出現 ${share} / 優先度 ${r.priority} / 自社ページ: ${cov}）`);
  }
  return lines.join("\n");
}
