/**
 * 順位表の 1 行を組み立てる（純関数）。
 *
 * 画面は「どの日と比較するか」だけを決め、順位帯・変化・スパークラインの
 * 計算はここに任せる（CSV 出力も同じ行から作るので数字がずれない）。
 */
import {
  classifyAio,
  pickComparison,
  rankBand,
  rankDelta,
  rankSparkValues,
  type AioClass,
  type RankBand,
  type RankDelta,
} from "./classify";
import type { RankGroup, RankKeyword, RankSnapshot } from "./store";

export interface RankRow {
  keyword: RankKeyword;
  groupName: string | null;
  /** 比較の基準日（未取得なら undefined） */
  current: RankSnapshot | undefined;
  previous: RankSnapshot | undefined;
  /** 未取得は undefined、圏外は null */
  currentRank: number | null | undefined;
  previousRank: number | null | undefined;
  delta: RankDelta;
  band: RankBand;
  /** スパークライン用（上向き = 改善） */
  spark: number[];
  /** 基準日の 5 区分。未取得は null */
  aioClass: AioClass | null;
  history: RankSnapshot[];
}

export interface BuildRowsOptions {
  /** 比較する 2 日。省略すると最新とその 1 つ前 */
  currentDate?: string | null;
  previousDate?: string | null;
}

export function buildRankRows(
  keywords: readonly RankKeyword[],
  snapshots: readonly RankSnapshot[],
  groups: readonly RankGroup[],
  options: BuildRowsOptions = {},
): RankRow[] {
  const byKeyword = new Map<string, RankSnapshot[]>();
  for (const s of snapshots) {
    const list = byKeyword.get(s.keywordId) ?? [];
    list.push(s);
    byKeyword.set(s.keywordId, list);
  }
  return keywords.map((keyword) => {
    const history = (byKeyword.get(keyword.id) ?? []).sort((a, b) => a.takenOn.localeCompare(b.takenOn));
    const { current, previous } = pickComparison(history, options.currentDate, options.previousDate);
    const currentRank = current ? current.rank : undefined;
    const previousRank = previous ? previous.rank : undefined;
    return {
      keyword,
      groupName: groups.find((g) => g.id === keyword.groupId)?.name ?? null,
      current,
      previous,
      currentRank,
      previousRank,
      delta: rankDelta(currentRank, previousRank),
      band: rankBand(currentRank ?? null),
      spark: rankSparkValues(history),
      aioClass: current ? classifyAio(current.aiOverview) : null,
      history,
    };
  });
}

/** 表示用の順位（未取得は「未取得」、圏外は「圏外」） */
export function rankText(rank: number | null | undefined): string {
  if (rank === undefined) return "未取得";
  if (rank === null) return "圏外";
  return `${rank}`;
}

/** URL からパス部分だけを短く見せる */
export function shortPath(url: string | null | undefined): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    return `${u.pathname}${u.search}` === "/" ? "/（トップ）" : `${u.pathname}${u.search}`;
  } catch {
    return url;
  }
}
