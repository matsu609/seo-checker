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
