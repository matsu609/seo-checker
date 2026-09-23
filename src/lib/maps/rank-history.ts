/**
 * 毎週の報告書に入っている Google マップ検索の順位（r29）を、推移グラフ用の系列にする。純粋関数。
 *
 * 報告書は週 1 回保存される（月曜の一斉更新）。各報告書の `rank.keywords[].rank` を
 * キーワードごとに日付順に並べる。順位が無い週（取得失敗・圏外）は null のまま残す。
 */
import { jstDateKey } from "@/lib/time/jst";
import type { SavedMeoReport } from "./history";

export interface RankSeriesPoint {
  /** YYYY-MM-DD（JST の日付。報告書の生成日時） */
  date: string;
  /** 圏外・未取得は null */
  rank: number | null;
}

export interface RankSeries {
  keyword: string;
  points: RankSeriesPoint[];
}

export interface RankHistory {
  /** 上位何件まで見ているか（圏外の境目） */
  limit: number;
  series: RankSeries[];
  /** 記録がある日付（古い順） */
  dates: string[];
}

/** 生成日時 → JST の日付キー。読めない日時は null（手書きの JST 計算を time/jst.ts に寄せた。2026-09-23） */
function dateKeyJst(iso: string): string | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : jstDateKey(d);
}

/** 報告書（順不同）→ 系列。同じ日に 2 件あれば新しいほう */
export function rankSeriesFromReports(reports: readonly Pick<SavedMeoReport, "generatedAt" | "rank">[]): RankHistory {
  const sorted = [...reports].sort((a, b) => a.generatedAt.localeCompare(b.generatedAt));
  const byKeyword = new Map<string, Map<string, number | null>>();
  const dates = new Set<string>();
  let limit = 20;
  for (const r of sorted) {
    if (!r.rank || r.rank.keywords.length === 0) continue;
    const date = dateKeyJst(r.generatedAt);
    if (!date) continue;
    limit = r.rank.limit || limit;
    dates.add(date);
    for (const k of r.rank.keywords) {
      const map = byKeyword.get(k.keyword) ?? new Map<string, number | null>();
      map.set(date, k.error ? null : k.rank);
      byKeyword.set(k.keyword, map);
    }
  }
  const dateList = [...dates].sort();
  const series: RankSeries[] = [...byKeyword.entries()].map(([keyword, map]) => ({
    keyword,
    points: dateList.map((date) => ({ date, rank: map.has(date) ? (map.get(date) ?? null) : null })),
  }));
  return { limit, series, dates: dateList };
}
