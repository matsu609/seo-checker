/**
 * 指標の集計（仕様書 §3.2〜§3.4）。純関数。
 *
 * 最小粒度は「プロンプト × モデル × 実行日時 × 反復番号」の観測 1 行。
 * そこから、表示する粒度（プロンプト群 × モデル × 週 / 4 週ローリング）にまとめる。
 *
 * 指名プロンプトと非指名プロンプトで**主指標が違う**のが肝。
 * 指名は参照率が 95〜100% に張り付くので、主指標にしない（§3.2）。
 */
import { weekStart } from "./schedule";
import { toBand, wilsonInterval, type Band } from "./stats";
import type { DomainClass, GeoAggregate, GeoModel } from "./types";

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
