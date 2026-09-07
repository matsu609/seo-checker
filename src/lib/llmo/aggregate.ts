/**
 * 保存済みの実行結果（LlmoRun[]）の集計（純関数）。
 *
 * 集計の対象は status === "ok" の行だけ。取得に失敗した日は分母にも入れず、
 * 時系列では「欠損」（null）として描く。前日値を引き継がない。
 */
import { PROVIDERS_META, PROVIDER_IDS, type ProviderId } from "./providers/meta";
import type { EntityJudgement, LlmoEntity, LlmoRun, UnclassifiedDomain } from "./types";

/** 集計する 2 つの指標 */
export type LlmoMetric = "brand" | "domain";

export const METRIC_LABELS: Record<LlmoMetric, string> = {
  brand: "ブランド言及率",
  domain: "ドメイン引用率",
};

function judgementOf(run: LlmoRun, entityId: string): EntityJudgement | undefined {
  return run.judgements.find((j) => j.entityId === entityId);
}

function hit(run: LlmoRun, entityId: string, metric: LlmoMetric): boolean {
  const j = judgementOf(run, entityId);
  if (!j) return false;
  return metric === "brand" ? j.brandMentioned : j.domainCited;
}

/** 集計対象（成功した行）だけに絞る */
export function successfulRuns(runs: readonly LlmoRun[]): LlmoRun[] {
  return runs.filter((r) => r.status === "ok");
}

/**
 * 割合。分母が 0 のときは null（0% と区別する）。
 */
export function rate(runs: readonly LlmoRun[], entityId: string, metric: LlmoMetric): number | null {
  const ok = successfulRuns(runs);
  if (ok.length === 0) return null;
  const n = ok.filter((r) => hit(r, entityId, metric)).length;
  return n / ok.length;
}

/** 保存されている日付（昇順・重複なし） */
export function datesOf(runs: readonly LlmoRun[]): string[] {
  return Array.from(new Set(runs.map((r) => r.takenOn))).sort((a, b) => a.localeCompare(b));
}

/** 最新の日付（無ければ null） */
export function latestDate(runs: readonly LlmoRun[]): string | null {
  const dates = datesOf(successfulRuns(runs));
  return dates.length > 0 ? dates[dates.length - 1] : null;
}

/** 実際に結果があるプロバイダ（登録順） */
export function providersOf(runs: readonly LlmoRun[]): ProviderId[] {
  const seen = new Set(runs.map((r) => r.providerId));
  return PROVIDER_IDS.filter((id) => seen.has(id));
}

export interface LlmoKpi {
  /** 自社の平均ブランド言及率（全モデル平均）。データが無ければ null */
  brandRate: number | null;
  /** 自社の平均ドメイン引用率 */
  domainRate: number | null;
  /** 集計に使った回答数 */
  calls: number;
  /** 実行に失敗した回答数（分母から除いた分） */
  failed: number;
  days: number;
  latestDate: string | null;
}

/** KPI カード用。date を渡すとその日だけ、省略すると全期間 */
export function kpi(runs: readonly LlmoRun[], selfEntityId: string | null, date?: string): LlmoKpi {
  const scoped = date ? runs.filter((r) => r.takenOn === date) : runs;
  const ok = successfulRuns(scoped);
  return {
    brandRate: selfEntityId ? rate(scoped, selfEntityId, "brand") : null,
    domainRate: selfEntityId ? rate(scoped, selfEntityId, "domain") : null,
    calls: ok.length,
    failed: scoped.length - ok.length,
    days: datesOf(ok).length,
    latestDate: latestDate(scoped),
  };
}

export interface Series {
  key: string;
  label: string;
  color: string;
  /** dates と同じ長さ。その日に成功した回答が無ければ null（欠損） */
  values: Array<number | null>;
  isSelf?: boolean;
}

export interface SeriesChart {
  dates: string[];
  series: Series[];
}

/** 系列色（palette.chart のインデックスを返す。色そのものは呼び出し側で引く） */
function colorAt(colors: readonly string[], index: number): string {
  return colors[index % colors.length];
}

/** 時系列（会社別）。metric ごとに 1 本ずつ */
export function seriesByEntity(
  runs: readonly LlmoRun[],
  entities: readonly LlmoEntity[],
  metric: LlmoMetric,
  colors: readonly string[],
): SeriesChart {
  const ok = successfulRuns(runs);
  const dates = datesOf(ok);
  const series = entities.map((entity, i) => ({
    key: entity.id,
    label: entity.name,
    color: colorAt(colors, i),
    ...(entity.isSelf ? { isSelf: true } : {}),
    values: dates.map((d) => rate(ok.filter((r) => r.takenOn === d), entity.id, metric)),
  }));
  return { dates, series };
}

/** 時系列（モデル別）。自社の言及率／引用率をモデルごとに割る */
export function seriesByProvider(
  runs: readonly LlmoRun[],
  entityId: string | null,
  metric: LlmoMetric,
  colors: readonly string[],
): SeriesChart {
  const ok = successfulRuns(runs);
  const dates = datesOf(ok);
  if (!entityId) return { dates, series: [] };
  const series = providersOf(ok).map((providerId, i) => ({
    key: providerId,
    label: PROVIDERS_META[providerId].label,
    color: colorAt(colors, i),
    values: dates.map((d) => rate(ok.filter((r) => r.takenOn === d && r.providerId === providerId), entityId, metric)),
  }));
  return { dates, series };
}

export interface RankingRow {
  entityId: string;
  name: string;
  isSelf: boolean;
  brandRate: number | null;
  domainRate: number | null;
  calls: number;
}

/** ランキング（最新日の会社別）。date 省略時は最新日 */
export function ranking(
  runs: readonly LlmoRun[],
  entities: readonly LlmoEntity[],
  date?: string | null,
): RankingRow[] {
  const target = date ?? latestDate(runs);
  const scoped = successfulRuns(target ? runs.filter((r) => r.takenOn === target) : runs);
  return entities
    .map((e) => ({
      entityId: e.id,
      name: e.name,
      isSelf: e.isSelf === true,
      brandRate: rate(scoped, e.id, "brand"),
      domainRate: rate(scoped, e.id, "domain"),
      calls: scoped.length,
    }))
    .sort((a, b) => (b.brandRate ?? -1) - (a.brandRate ?? -1) || a.name.localeCompare(b.name, "ja"));
}

export interface MatrixCell {
  providerId: ProviderId;
  brand: boolean;
  domain: boolean;
  /** 集計に使った回答数（0 なら「—」） */
  calls: number;
}

export interface MatrixRow {
  entityId: string;
  name: string;
  isSelf: boolean;
  cells: MatrixCell[];
}

/**
 * 競合比較（会社 × モデル × {ブランド, ドメイン}）。
 * 1 つでも言及・引用があれば ○ にする（最新日のプロンプト横断）。
 */
export function comparisonMatrix(
  runs: readonly LlmoRun[],
  entities: readonly LlmoEntity[],
  date?: string | null,
): { providers: ProviderId[]; rows: MatrixRow[] } {
  const target = date ?? latestDate(runs);
  const scoped = successfulRuns(target ? runs.filter((r) => r.takenOn === target) : runs);
  const providers = providersOf(scoped);
  const rows = entities.map((e) => ({
    entityId: e.id,
    name: e.name,
    isSelf: e.isSelf === true,
    cells: providers.map((providerId) => {
      const forProvider = scoped.filter((r) => r.providerId === providerId);
      return {
        providerId,
        brand: forProvider.some((r) => hit(r, e.id, "brand")),
        domain: forProvider.some((r) => hit(r, e.id, "domain")),
        calls: forProvider.length,
      };
    }),
  }));
  return { providers, rows };
}

/** 未分類ドメインの合算 Top N（競合登録の候補） */
export function unclassifiedTop(runs: readonly LlmoRun[], limit = 10): UnclassifiedDomain[] {
  const map = new Map<string, UnclassifiedDomain>();
  for (const run of successfulRuns(runs)) {
    for (const u of run.unclassified) {
      const found = map.get(u.domain);
      if (found) found.count += u.count;
      else map.set(u.domain, { ...u });
    }
  }
  return Array.from(map.values())
    .sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain))
    .slice(0, limit);
}

/** プロンプト単位の内訳（表の行） */
export interface PromptRow {
  promptId: string;
  promptText: string;
  brandRate: number | null;
  domainRate: number | null;
  calls: number;
  failed: number;
}

export function promptRows(runs: readonly LlmoRun[], selfEntityId: string | null): PromptRow[] {
  const byPrompt = new Map<string, LlmoRun[]>();
  for (const run of runs) {
    const list = byPrompt.get(run.promptId) ?? [];
    list.push(run);
    byPrompt.set(run.promptId, list);
  }
  return Array.from(byPrompt.values()).map((list) => {
    const ok = successfulRuns(list);
    return {
      promptId: list[0].promptId,
      promptText: list[0].promptText,
      brandRate: selfEntityId ? rate(list, selfEntityId, "brand") : null,
      domainRate: selfEntityId ? rate(list, selfEntityId, "domain") : null,
      calls: ok.length,
      failed: list.length - ok.length,
    };
  });
}
