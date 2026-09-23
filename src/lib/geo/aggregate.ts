/**
 * 指標の集計（仕様書 §3.2〜§3.4）。純関数。
 *
 * 最小粒度は「プロンプト × モデル × 実行日時 × 反復番号」の観測 1 行。
 * そこから、表示する粒度（プロンプト群 × モデル × 週 / 4 週ローリング）にまとめる。
 *
 * 指名プロンプトと非指名プロンプトで**主指標が違う**のが肝。
 * 指名は参照率が 95〜100% に張り付くので、主指標にしない（§3.2）。
 */
import { comingWeekdays } from "@/lib/demo/dates";
import { SAMPLE_POINTS, SAMPLE_SERIES_MAX } from "@/lib/demo/sample";
import { weekStart } from "./schedule";
import { toBand, wilsonInterval, type Band } from "./stats";
import type { DomainClass, GeoAggregate, GeoModel, MeasurementKind } from "./types";

/** 集計に渡す 1 観測（保存形からの写し。必要な列だけ） */
export interface AggregateInput {
  brandId: string;
  promptId: string | null;
  /** 検索キーワードの観測（順位・AI Overviews）のときだけ入る */
  keywordId: string | null;
  /** プロンプトのタグ。プロンプト群の切り口（§3.4） */
  tags: readonly string[];
  isBranded: boolean;
  model: GeoModel;
  executedAt: string;
  mentioned: boolean;
  cited: boolean;
  /** 引用ドメインの分類（引用元構成比に使う） */
  domainClasses: readonly DomainClass[];
  /** 引用されたドメインそのもの（ドメイン別の集計に使う。2026-09-22） */
  citedDomains: readonly string[];
  /**
   * 計測の種類（2026-09-23）。省略時はプロンプトの観測を LLM、キーワードの観測を順位計測とみなす
   * （順位計測も model = "aio" なので、種類が無いと AI Overviews と区別できない）
   */
  kind?: MeasurementKind;
}

/** 種類が無い行の種類（プロンプト → LLM、キーワード → 順位計測。分母に入れない側に倒す） */
function kindOf(o: Pick<AggregateInput, "kind" | "promptId">): MeasurementKind {
  return o.kind ?? (o.promptId ? "llm" : "rank");
}

/**
 * ブランドシェア（§3.3）の母集団: **登録したプロンプトへの LLM の回答だけ**（2026-09-23）。
 *
 * 以前はキーワード側（順位・AI Overviews・AI モード）の観測まで同じ分母に入っていた。
 * 順位計測は回答本文が無い（必ず「言及なし」）ので、キーワードが多い人ほどシェアが
 * 実際より低く出ていた。「今すぐ実行」（どのプロンプトにも紐づかない単発の問い）も
 * 登録したプロンプト群ではないので入れない。
 */
export function promptObservations<T extends Pick<AggregateInput, "kind" | "promptId">>(observations: readonly T[]): T[] {
  return observations.filter((o) => o.promptId !== null && kindOf(o) === "llm");
}

/**
 * キーワード側の AI の回答（AI Overviews / AI モード）だけ。**順位計測は入れない**
 * （順位計測も model = "aio" で保存しているので、入れると AI Overviews の n が倍に数えられていた）。
 */
export function keywordAiObservations<T extends Pick<AggregateInput, "kind" | "promptId" | "keywordId">>(observations: readonly T[]): T[] {
  return observations.filter((o) => o.keywordId !== null && (kindOf(o) === "aio" || kindOf(o) === "ai_mode"));
}

/**
 * モデル別シェアの母集団: プロンプトの回答（LLM ごと）+ キーワードの AI の回答（AI Overviews / AI モード）。
 * モデルごとに分けて数えるので、1 つのモデルの中でプロンプトとキーワードが混ざることはない。
 */
export function answerObservations<T extends Pick<AggregateInput, "kind" | "promptId" | "keywordId">>(observations: readonly T[]): T[] {
  const prompts = new Set(promptObservations(observations));
  const keywords = new Set(keywordAiObservations(observations));
  return observations.filter((o) => prompts.has(o) || keywords.has(o));
}

export interface ShareResult {
  brandId: string;
  n: number;
  mentions: number;
  citations: number;
  shareMention: number;
  shareCitation: number;
  ciLow: number;
  ciHigh: number;
  band: Band;
}

/** ブランドごとの参照率・引用率と Wilson 区間（§3.3） */
export function shares(observations: readonly AggregateInput[]): ShareResult[] {
  const byBrand = new Map<string, AggregateInput[]>();
  for (const o of observations) {
    const list = byBrand.get(o.brandId) ?? [];
    list.push(o);
    byBrand.set(o.brandId, list);
  }
  return [...byBrand.entries()]
    .map(([brandId, rows]) => {
      const n = rows.length;
      const mentions = rows.filter((r) => r.mentioned).length;
      const citations = rows.filter((r) => r.cited).length;
      const ci = wilsonInterval(mentions, n);
      return {
        brandId,
        n,
        mentions,
        citations,
        shareMention: n > 0 ? mentions / n : 0,
        shareCitation: n > 0 ? citations / n : 0,
        ciLow: ci.low,
        ciHigh: ci.high,
        band: toBand(mentions, n),
      };
    })
    .sort((a, b) => b.shareMention - a.shareMention);
}

/** 期間で絞る。`days` 日前から現在まで */
export function withinDays(observations: readonly AggregateInput[], days: number, now = new Date()): AggregateInput[] {
  const from = now.getTime() - days * 24 * 60 * 60 * 1000;
  return observations.filter((o) => {
    const t = Date.parse(o.executedAt);
    return Number.isFinite(t) && t >= from;
  });
}

/** 見出し数値は 4 週ローリング（§5.1-1） */
export const ROLLING_DAYS = 28;

export function rollingShares(observations: readonly AggregateInput[], now = new Date()): ShareResult[] {
  return shares(withinDays(observations, ROLLING_DAYS, now));
}

/** モデル別に分ける（§3.4 の表示粒度） */
export function byModel(observations: readonly AggregateInput[]): Map<GeoModel, AggregateInput[]> {
  const out = new Map<GeoModel, AggregateInput[]>();
  for (const o of observations) {
    const list = out.get(o.model) ?? [];
    list.push(o);
    out.set(o.model, list);
  }
  return out;
}

/** タグ（プロンプト群）で分ける。タグの無いものは "all" にだけ入る */
export function byTag(observations: readonly AggregateInput[]): Map<string, AggregateInput[]> {
  const out = new Map<string, AggregateInput[]>([["all", [...observations]]]);
  for (const o of observations) {
    for (const tag of o.tags) {
      const list = out.get(tag) ?? [];
      list.push(o);
      out.set(tag, list);
    }
  }
  return out;
}

/* ───────────── 計測対象ごとの出現率（棒グラフ用） ───────────── */

/**
 * 「プロンプト 1 本ごと」「キーワード 1 語ごと」に、自社がどれくらい出てくるかを出す。
 *
 * 仕様書の主指標はプロンプト群をまとめたブランドシェア（§3.3）で、**単体は
 * n が小さい**（通常プロンプトは 4 週で n=12、キーワードの AI Overviews は
 * 週 1 回なので n=4）。そのため点の率だけを見せると読み違えるので、
 * ここでは必ず Wilson 区間（§5.1-2）と段階（§5.1-3）を一緒に返し、
 * **画面では棒（率）と帯（区間）を必ずセットで描く**。
 *
 * 利用者の指示 2026-09-20「キーワードごとに棒グラフ。確率に幅を持たせて分布を見たい」。
 */

/** 何を「ヒット」と数えるか。LLM は本文への言及、AI Overviews は引用リンク */
export type HitMetric = "mention" | "citation";

export interface TargetShare {
  /** プロンプト ID かキーワード ID */
  targetId: string;
  n: number;
  hits: number;
  rate: number;
  ciLow: number;
  ciHigh: number;
  band: Band;
  /** 帯の広さ（±pt の計算に使う。high - low） */
  spread: number;
  /** モデル別の内訳（観測が無いモデルは含めない） */
  perModel: { model: GeoModel; n: number; hits: number; rate: number }[];
}

function isHit(row: AggregateInput, metric: HitMetric): boolean {
  return metric === "citation" ? row.cited : row.mentioned;
}

/**
 * 計測対象ごとにまとめる。`pick` で「プロンプト軸」か「キーワード軸」かを選ぶ。
 * 自社ブランドの行だけを数える（競合と混ぜない）。
 */
export function targetShares(
  observations: readonly AggregateInput[],
  options: { brandId: string; axis: "prompt" | "keyword"; metric: HitMetric },
): TargetShare[] {
  const byTarget = new Map<string, AggregateInput[]>();
  for (const o of observations) {
    if (o.brandId !== options.brandId) continue;
    const targetId = options.axis === "prompt" ? o.promptId : o.keywordId;
    if (!targetId) continue;
    const list = byTarget.get(targetId) ?? [];
    list.push(o);
    byTarget.set(targetId, list);
  }

  return [...byTarget.entries()]
    .map(([targetId, rows]) => {
      const n = rows.length;
      const hits = rows.filter((r) => isHit(r, options.metric)).length;
      const ci = wilsonInterval(hits, n);
      const perModel = [...byModel(rows).entries()]
        .map(([model, modelRows]) => {
          const mHits = modelRows.filter((r) => isHit(r, options.metric)).length;
          return { model, n: modelRows.length, hits: mHits, rate: modelRows.length > 0 ? mHits / modelRows.length : 0 };
        })
        .sort((a, b) => b.n - a.n);
      return {
        targetId,
        n,
        hits,
        rate: n > 0 ? hits / n : 0,
        ciLow: ci.low,
        ciHigh: ci.high,
        band: toBand(hits, n),
        spread: Math.round((ci.high - ci.low) * 1e6) / 1e6,
        perModel,
      };
    })
    .sort((a, b) => b.rate - a.rate || b.n - a.n);
}

/** 4 週ローリングで計測対象ごとにまとめる（見出しと同じ窓。§5.1-1） */
export function rollingTargetShares(
  observations: readonly AggregateInput[],
  options: { brandId: string; axis: "prompt" | "keyword"; metric: HitMetric },
  now = new Date(),
): TargetShare[] {
  return targetShares(withinDays(observations, ROLLING_DAYS, now), options);
}

/** 画面に渡す形（プロンプト文 / キーワード文を添えたもの） */
export interface LabeledTargetShare extends TargetShare {
  label: string;
}

/** 行に含まれるモデルの一覧（絞り込みの選択肢） */
export function availableModels(rows: readonly LabeledTargetShare[]): GeoModel[] {
  const set = new Set<GeoModel>();
  for (const row of rows) for (const m of row.perModel) set.add(m.model);
  return [...set];
}

/**
 * モデル 1 つに絞り直す。内訳（perModel）の分子分母から率を作り直し、
 * **区間もその n で引き直す**（絞ると n が減るので帯は必ず広くなる）。
 * 観測の無い行は落とす。
 */
export function filterTargetsByModel(rows: readonly LabeledTargetShare[], model: GeoModel | "all"): LabeledTargetShare[] {
  if (model === "all") return [...rows];
  const out: LabeledTargetShare[] = [];
  for (const row of rows) {
    const entry = row.perModel.find((m) => m.model === model);
    if (!entry || entry.n === 0) continue;
    const ci = wilsonInterval(entry.hits, entry.n);
    out.push({
      ...row,
      n: entry.n,
      hits: entry.hits,
      rate: entry.rate,
      ciLow: ci.low,
      ciHigh: ci.high,
      band: toBand(entry.hits, entry.n),
      spread: Math.round((ci.high - ci.low) * 1e6) / 1e6,
      perModel: [entry],
    });
  }
  return out;
}

/* ───────────── 週ごとの推移（折れ線グラフ用） ───────────── */

/**
 * 「キーワードごとに順位を追うような折れ線」（利用者の指示 2026-09-21）。
 *
 * x = 週（月曜始まり）、y = その週の出現率、1 本の線 = キーワード 1 語 or プロンプト 1 本。
 *
 * **観測が 1 件も無い週は null にする**（0% と区別する）。LineChart は null で線を切るので、
 * 「その週は測っていない」と「その週は 0 回だった」が図の上で別物に見える。
 * ここを 0 で埋めると、計測が止まっただけなのに「急落した」と読めてしまう。
 */
export interface WeeklyPoint {
  /** 週の始まり（月曜。YYYY-MM-DD） */
  weekStart: string;
  n: number;
  hits: number;
  /** 0〜1。観測が無い週は null */
  rate: number | null;
}

export interface WeeklySeries {
  targetId: string;
  label: string;
  points: WeeklyPoint[];
  /** 直近で値のある週の率（並べ替えと既定の選択に使う）。1 つも無ければ null */
  latest: number | null;
  /** 期間内の観測の合計 */
  totalN: number;
}

/** 直近 `weeks` 週ぶんの週初（古い順）を返す */
export function recentWeekStarts(weeks: number, now = new Date()): string[] {
  const out: string[] = [];
  for (let i = weeks - 1; i >= 0; i -= 1) {
    out.push(weekStart(new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000)));
  }
  return out;
}

/**
 * 計測対象ごとの週次推移。`weeks` 週ぶんの枠を必ず作り、観測の無い週は null で埋める。
 * 並びは「直近の率が高い順 → 観測数の多い順」。
 */
export function weeklySeries(
  observations: readonly AggregateInput[],
  options: { brandId: string; axis: "prompt" | "keyword"; metric: HitMetric; labels: ReadonlyMap<string, string>; weeks?: number },
  now = new Date(),
): WeeklySeries[] {
  const weeks = options.weeks ?? 8;
  const frame = recentWeekStarts(weeks, now);
  const frameIndex = new Map(frame.map((w, i) => [w, i]));

  // targetId → 週 → { n, hits }
  const byTarget = new Map<string, Map<string, { n: number; hits: number }>>();
  for (const o of observations) {
    if (o.brandId !== options.brandId) continue;
    const targetId = options.axis === "prompt" ? o.promptId : o.keywordId;
    if (!targetId || !options.labels.has(targetId)) continue;
    const t = Date.parse(o.executedAt);
    if (!Number.isFinite(t)) continue;
    const week = weekStart(new Date(t));
    if (!frameIndex.has(week)) continue;
    const weeksOf = byTarget.get(targetId) ?? new Map<string, { n: number; hits: number }>();
    const cell = weeksOf.get(week) ?? { n: 0, hits: 0 };
    cell.n += 1;
    if (isHit(o, options.metric)) cell.hits += 1;
    weeksOf.set(week, cell);
    byTarget.set(targetId, weeksOf);
  }

  const out: WeeklySeries[] = [];
  for (const [targetId, weeksOf] of byTarget) {
    const points: WeeklyPoint[] = frame.map((week) => {
      const cell = weeksOf.get(week);
      // 観測の無い週は null（0% ではない）
      return cell ? { weekStart: week, n: cell.n, hits: cell.hits, rate: cell.hits / cell.n } : { weekStart: week, n: 0, hits: 0, rate: null };
    });
    const withValue = points.filter((p) => p.rate !== null);
    out.push({
      targetId,
      label: options.labels.get(targetId) ?? targetId,
      points,
      latest: withValue.length > 0 ? (withValue[withValue.length - 1].rate as number) : null,
      totalN: points.reduce((a, p) => a + p.n, 0),
    });
  }

  return out.sort((a, b) => (b.latest ?? -1) - (a.latest ?? -1) || b.totalN - a.totalN);
}

/* ───────────── ドメイン別の引用（2026-09-22） ───────────── */

/**
 * 「どのサイトが引用されているか」（画面の「ドメイン別ソース引用状況」）。
 *
 * 業界の地図（LLM Mentions）と紛らわしいので違いを書いておく:
 *   ここ       … **自分が登録したプロンプト / キーワードの計測**で実際に出てきた引用元
 *   業界の地図 … DataForSEO が集めた世の中の AI 回答での引用元
 * つまりここは「自分の観測範囲の実測」。母集団が違うので足し引きしない。
 */
export interface DomainCitation {
  domain: string;
  /** 引用された計測の数 */
  count: number;
  /** 全体に占める割合（0〜1） */
  share: number;
  /** 自社 / 競合 / 第三者。判定できなければ null */
  domainClass: DomainClass | null;
}

/**
 * 観測から引用ドメインを数える。1 観測に複数ドメインが入るので、
 * **同じ観測の中の重複は 1 回として数える**（同じ回答で 3 回リンクされても 1 回）。
 */
export function domainCitations(
  observations: readonly AggregateInput[],
  options: { own?: readonly string[]; competitors?: readonly string[]; limit?: number } = {},
): DomainCitation[] {
  const own = (options.own ?? []).map((d) => d.toLowerCase());
  const competitors = (options.competitors ?? []).map((d) => d.toLowerCase());
  const matches = (domain: string, list: readonly string[]) => list.some((d) => domain === d || domain.endsWith(`.${d}`));

  const counts = new Map<string, number>();
  let total = 0;
  for (const o of observations) {
    // 同じ観測の中の重複は 1 回に畳む
    for (const domain of new Set(o.citedDomains.map((d) => d.toLowerCase()).filter(Boolean))) {
      counts.set(domain, (counts.get(domain) ?? 0) + 1);
      total += 1;
    }
  }
  if (total === 0) return [];

  return [...counts.entries()]
    .map(([domain, count]) => ({
      domain,
      count,
      share: count / total,
      domainClass: matches(domain, own) ? ("own" as const) : matches(domain, competitors) ? ("competitor" as const) : ("third_party" as const),
    }))
    .sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain))
    .slice(0, options.limit ?? 12);
}

/* ───────────── 絞り込み（画面上部のフィルタ行。2026-09-22） ───────────── */

export interface ObservationFilter {
  /** モデル 1 つに絞る。"all" なら絞らない */
  model?: GeoModel | "all";
  /** プロンプトのタグ 1 つに絞る。"all" なら絞らない */
  tag?: string;
  /** 直近何日ぶんか。既定は 4 週ローリング（ROLLING_DAYS） */
  days?: number;
}

/**
 * フィルタをまとめて当てる。**順番は 期間 → モデル → タグ**（絞るほど n が減るので、
 * 画面では必ず n を出して「この条件では読み取れない」が分かるようにする）。
 */
export function applyFilter(observations: readonly AggregateInput[], filter: ObservationFilter, now = new Date()): AggregateInput[] {
  let rows = withinDays(observations, filter.days ?? ROLLING_DAYS, now);
  if (filter.model && filter.model !== "all") rows = rows.filter((o) => o.model === filter.model);
  if (filter.tag && filter.tag !== "all") rows = rows.filter((o) => o.tags.includes(filter.tag as string));
  return rows;
}

/** 期間の選択肢（画面のフィルタ行）。4 週 = 見出しの既定 */
export const PERIOD_OPTIONS = [
  { days: 7, label: "直近 1 週間" },
  { days: 28, label: "直近 4 週間" },
  { days: 56, label: "直近 8 週間" },
  { days: 90, label: "直近 90 日" },
] as const;

/* ───────────── キーワードごとの成果（AIO 分析。2026-09-22） ───────────── */

/**
 * 「SEO では上位なのに AI の回答では引用されていない」を 1 行で見せるための表。
 *
 * 3 つの計測（順位 / AI Overviews / AI モード）は別々の行として保存されているので、
 * **キーワード単位で最新のものを拾って 1 行にまとめる**。
 *
 * 判定の決めごと（言えないことを言わないため）:
 *   - `未計測` … その種類の計測がまだ無い。**「非出現」や「引用なし」とは書かない**
 *   - `非出現` … AI の回答自体が出なかった（引用リンクが 1 つも無い）
 *   - `引用なし` … AI の回答は出たが、自社ドメインが参照されなかった
 */
export type AioAppearance = "unmeasured" | "absent" | "present";
export type AioOutcome = "unmeasured" | "none" | "cited";

export const AIO_APPEARANCE_LABELS: Record<AioAppearance, string> = {
  unmeasured: "未計測",
  absent: "非出現",
  present: "出現",
};

export const AIO_OUTCOME_LABELS: Record<AioOutcome, string> = {
  unmeasured: "—",
  none: "引用なし",
  cited: "引用あり",
};

export interface KeywordOutcomeRow {
  keywordId: string;
  keyword: string;
  /** 検索順位。圏外・未計測は null */
  seoRank: number | null;
  /** 順位を測ったか（null が「圏外」か「未計測」かを区別する） */
  rankMeasured: boolean;
  appearance: AioAppearance;
  outcome: AioOutcome;
  /** いちばん新しい計測の時刻 */
  lastCheckedAt: string | null;
}

export interface KeywordOutcomeSummary {
  rows: KeywordOutcomeRow[];
  /** AI の回答が出たキーワードの数 */
  appearedCount: number;
  /** そのうち自社が引用されたキーワードの数 */
  citedCount: number;
  /** citedCount / appearedCount。出現が 0 なら null（0% と書かない） */
  citedRate: number | null;
  /** 打ち手になる行（出現しているのに引用されていない。SEO 上位ほど上） */
  opportunities: KeywordOutcomeRow[];
}

/** 1 計測ぶんの入力（store.listKeywordOutcomes の戻り値と同じ形） */
export interface KeywordOutcomeInput {
  keywordId: string;
  kind: "llm" | "rank" | "aio" | "ai_mode";
  model: GeoModel;
  executedAt: string;
  rank: number | null;
  citationCount: number;
  cited: boolean;
}

/**
 * キーワードごとに 1 行へまとめる。`keywords` に無い ID は捨てる（設定から消えた語）。
 * 並びは **打ち手になる順**（出現 × 引用なし → 出現 × 引用あり → 非出現 → 未計測）、
 * 同じ区分の中では SEO 順位の良い順。
 */
export function keywordOutcomes(inputs: readonly KeywordOutcomeInput[], keywords: ReadonlyMap<string, string>): KeywordOutcomeSummary {
  const byKeyword = new Map<string, KeywordOutcomeInput[]>();
  for (const i of inputs) {
    if (!keywords.has(i.keywordId)) continue;
    const list = byKeyword.get(i.keywordId) ?? [];
    list.push(i);
    byKeyword.set(i.keywordId, list);
  }

  const newest = (list: readonly KeywordOutcomeInput[]) =>
    list.reduce<KeywordOutcomeInput | null>((acc, x) => (acc === null || x.executedAt > acc.executedAt ? x : acc), null);

  const rows: KeywordOutcomeRow[] = [];
  for (const [keywordId, keyword] of keywords) {
    const list = byKeyword.get(keywordId) ?? [];
    const rankRow = newest(list.filter((x) => x.kind === "rank"));
    // AI Overviews と AI モードのうち新しいほうを代表にする
    const aiRow = newest(list.filter((x) => x.kind === "aio" || x.kind === "ai_mode"));
    const appearance: AioAppearance = aiRow === null ? "unmeasured" : aiRow.citationCount > 0 ? "present" : "absent";
    const outcome: AioOutcome = appearance !== "present" ? "unmeasured" : aiRow?.cited ? "cited" : "none";
    const lastCheckedAt = newest(list)?.executedAt ?? null;
    rows.push({
      keywordId,
      keyword,
      seoRank: rankRow?.rank ?? null,
      rankMeasured: rankRow !== null,
      appearance,
      outcome,
      lastCheckedAt,
    });
  }

  // 打ち手になる順に並べる
  const weight = (r: KeywordOutcomeRow) =>
    r.appearance === "present" && r.outcome === "none" ? 0 : r.appearance === "present" ? 1 : r.appearance === "absent" ? 2 : 3;
  rows.sort((a, b) => weight(a) - weight(b) || (a.seoRank ?? 9999) - (b.seoRank ?? 9999) || a.keyword.localeCompare(b.keyword, "ja"));

  const appearedCount = rows.filter((r) => r.appearance === "present").length;
  const citedCount = rows.filter((r) => r.outcome === "cited").length;
  return {
    rows,
    appearedCount,
    citedCount,
    citedRate: appearedCount > 0 ? citedCount / appearedCount : null,
    opportunities: rows.filter((r) => r.appearance === "present" && r.outcome === "none"),
  };
}

/* ───────────── 見本の線（イメージ。実測ではない） ───────────── */

/**
 * 計測を始める前に「こんな数字が取れます」を見せるための**作り物の線**
 * （利用者の指示 2026-09-21「データがないうちは 4 週間分を破線で。実線は実測、破線はイメージ」）。
 *
 * **ここで作る値は実測ではない。**画面では必ず破線で描き、「イメージ」と明記し、
 * 実測の線と同じカードに混ぜない。数字は固定（乱数を使わない）ので、
 * 開くたびに変わったり、テストで揺れたりしない。
 */

/** 見本に使う週数（利用者の指定は 4 週）。見本の共通の点の数と同じ */
export const SAMPLE_WEEKS = SAMPLE_POINTS;

/** 見本に描く線の本数の上限（多いと図が読めない。見本の共通の値） */
export { SAMPLE_SERIES_MAX };

/** 登録がまだ無いときに使う、例としての言葉 */
export const SAMPLE_FALLBACK_LABELS = ["例: 地域名 + 業種", "例: サービス名", "例: 〇〇 おすすめ"] as const;

/**
 * これから計測する週の始まり（月曜）を古い順に返す（日本時間）。
 * **過去ではなく先の週**を使う: 見本を過去の日付で描くと「もう測った数字」に見えてしまうため。
 *
 * 以前は 1 本目が「今週の月曜」で、火〜日曜に開くと過去の日付になっていた（2026-09-23）。
 * 月曜の 5:00 の定期実行より前なら今週の月曜、過ぎていれば次の月曜から数える。
 */
export function comingWeekStarts(weeks: number, now = new Date()): string[] {
  return comingWeekdays(weeks, 1, now);
}

/**
 * 見本の形。3 本で「上がっている / 横ばい / まだ低い」を見せる。
 * 率は 0〜1。週数が 4 でなくても足りない分は最後の値を伸ばす。
 */
const SAMPLE_SHAPES: readonly (readonly number[])[] = [
  [0.18, 0.31, 0.44, 0.58],
  [0.4, 0.36, 0.41, 0.39],
  [0.06, 0.09, 0.08, 0.15],
];

/**
 * 見本の線を作る。`labels` は利用者が登録済みの言葉（あればそれを使うほうが伝わる）。
 * 空なら `SAMPLE_FALLBACK_LABELS` を使う。
 */
export function sampleSeries(labels: readonly string[], weeks: readonly string[]): WeeklySeries[] {
  const names = (labels.length > 0 ? labels : SAMPLE_FALLBACK_LABELS).slice(0, SAMPLE_SERIES_MAX);
  return names.map((label, i) => {
    const shape = SAMPLE_SHAPES[i % SAMPLE_SHAPES.length];
    const points: WeeklyPoint[] = weeks.map((week, w) => {
      const rate = shape[Math.min(w, shape.length - 1)];
      return { weekStart: week, n: 0, hits: 0, rate };
    });
    return {
      targetId: `sample-${i}`,
      label,
      points,
      latest: points.length > 0 ? (points[points.length - 1].rate as number) : null,
      // 観測 0 件 = 実測ではないことが、この値からも分かるようにしておく
      totalN: 0,
    };
  });
}

/* ───────────── 指名プロンプトの主指標（§3.2） ───────────── */

export interface BrandedMetrics {
  /** 指名プロンプトのうち自社ドメインが引用された割合 */
  ownCitationRate: number;
  /** 引用元の構成比（件数） */
  citationMix: Record<DomainClass, number>;
  /** 指名プロンプトの回答に競合が参照された割合 */
  competitorCoMentionRate: number;
  n: number;
}

export function brandedMetrics(observations: readonly AggregateInput[], ownBrandId: string): BrandedMetrics {
  const branded = observations.filter((o) => o.isBranded);
  const ownRows = branded.filter((o) => o.brandId === ownBrandId);
  const competitorRows = branded.filter((o) => o.brandId !== ownBrandId);

  const mix: Record<DomainClass, number> = { own: 0, competitor: 0, third_party: 0 };
  for (const row of ownRows) for (const cls of row.domainClasses) mix[cls] += 1;

  // 競合同時言及率は「1 つでも競合が参照された計測の割合」なので、計測単位で数える
  const measurementsWithCompetitor = new Set(
    competitorRows.filter((o) => o.mentioned).map((o) => `${o.promptId}|${o.model}|${o.executedAt}`),
  );
  const totalMeasurements = new Set(ownRows.map((o) => `${o.promptId}|${o.model}|${o.executedAt}`));

  return {
    ownCitationRate: ownRows.length > 0 ? ownRows.filter((o) => o.cited).length / ownRows.length : 0,
    citationMix: mix,
    competitorCoMentionRate: totalMeasurements.size > 0 ? measurementsWithCompetitor.size / totalMeasurements.size : 0,
    n: ownRows.length,
  };
}

/* ───────────── 保存用の形（§8 Aggregate） ───────────── */

export function toAggregates(
  observations: readonly AggregateInput[],
  window: "week" | "rolling4w",
  now = new Date(),
): GeoAggregate[] {
  const rows: GeoAggregate[] = [];
  const period = weekStart(now);
  const source = window === "rolling4w" ? withinDays(observations, ROLLING_DAYS, now) : observations;
  for (const [tag, tagged] of byTag(source)) {
    for (const [model, modelRows] of byModel(tagged)) {
      for (const share of shares(modelRows)) {
        rows.push({
          brandId: share.brandId,
          promptGroup: tag,
          model,
          window,
          periodStart: period,
          shareMention: share.shareMention,
          shareCitation: share.shareCitation,
          ciLow: share.ciLow,
          ciHigh: share.ciHigh,
          n: share.n,
        });
      }
    }
    // モデルをまたいだ合計も持つ（ダッシュボードの見出し）
    for (const share of shares(tagged)) {
      rows.push({
        brandId: share.brandId,
        promptGroup: tag,
        model: "all",
        window,
        periodStart: period,
        shareMention: share.shareMention,
        shareCitation: share.shareCitation,
        ciLow: share.ciLow,
        ciHigh: share.ciHigh,
        n: share.n,
      });
    }
  }
  return rows;
}

/** モデル更新の検知（§5.3）。バージョンが変わった瞬間をイベントにする */
export function detectVersionChange(
  previous: string | null,
  current: string | null,
): { changed: boolean; from: string | null; to: string | null } {
  if (!current) return { changed: false, from: previous, to: previous };
  if (previous === null) return { changed: false, from: null, to: current };
  return previous === current ? { changed: false, from: previous, to: current } : { changed: true, from: previous, to: current };
}
