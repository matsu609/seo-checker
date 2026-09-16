/**
 * Search Console からの取り込み（docs/dev/diagnosis-rules-spec.md §4.1）。サーバー専用。
 *
 * 利用者の決定（2026-09-15）で入口は**既存の Google 連携（OAuth）のみ**。
 * CSV アップロードは作らない。連携していなければ null を返し、データ品質ルール
 * （D05）が「何が足りないか」を言う。
 *
 * 当期と前期を同じ日数で取り、クエリ・ページ・デバイス・国・日付・検索での見え方を
 * 集める。行数の上限に当たったことは notes に残す（D04 のクエリ取得率と合わせて、
 * 「一覧に出たクエリの中での比率」だと分かるようにするため）。
 */
import { previousRange } from "@/lib/ga4/period";
import { totalsOf } from "@/lib/google/search-console/parse";
import { searchConsoleRange } from "@/lib/google/search-console/period";
import type { SearchAnalyticsDimension, SearchAnalyticsRow, SearchConsoleClient } from "@/lib/google/search-console/types";
import type { GscDataset, KeyedMetrics } from "../types";

/** 分析期間（§8 の minimum_analysis_days に合わせる） */
export const DIAGNOSIS_DAYS = 28;
/** 次元ごとに取る行数。GSC の上限は 25,000 だが、診断に使うのは上位で足りる */
const ROW_LIMIT = 1000;
const SMALL_ROW_LIMIT = 100;

function toKeyed(rows: readonly SearchAnalyticsRow[]): KeyedMetrics[] {
  return rows.map((r) => ({ key: r.keys[0] ?? "", clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position }));
}

export interface CollectGscOptions {
  days?: number;
  now?: Date;
}

/**
 * 診断用のデータを取る。
 *
 * 失敗したら例外を投げずに null を返す（報告書全体を止めないため。精密分析の
 * 既存の方針と同じ）。何が起きたかは notes に入れて呼び出し側が受け取る。
 */
export async function collectGscDataset(
  client: SearchConsoleClient,
  siteUrl: string,
  options: CollectGscOptions = {},
): Promise<{ dataset: GscDataset | null; notes: string[] }> {
  const notes: string[] = [];
  const days = options.days ?? DIAGNOSIS_DAYS;
  const current = searchConsoleRange(days, options.now);
  const previous = previousRange(current);

  const ask = (range: { startDate: string; endDate: string }, dimensions: SearchAnalyticsDimension[] | undefined, rowLimit: number) =>
    client.query(siteUrl, { ...range, ...(dimensions ? { dimensions } : {}), rowLimit });

  try {
    const [
      totalsCurrent,
      totalsPrevious,
      queriesCurrent,
      queriesPrevious,
      pagesCurrent,
      pagesPrevious,
      devicesCurrent,
      devicesPrevious,
      countriesCurrent,
      countriesPrevious,
      byDate,
    ] = await Promise.all([
      ask(current, undefined, 1),
      ask(previous, undefined, 1),
      ask(current, ["query"], ROW_LIMIT),
      ask(previous, ["query"], ROW_LIMIT),
      ask(current, ["page"], ROW_LIMIT),
      ask(previous, ["page"], ROW_LIMIT),
      ask(current, ["device"], SMALL_ROW_LIMIT),
      ask(previous, ["device"], SMALL_ROW_LIMIT),
      ask(current, ["country"], SMALL_ROW_LIMIT),
      ask(previous, ["country"], SMALL_ROW_LIMIT),
      ask(current, ["date"], 400),
    ]);

    // 検索での見え方は他の次元と併用できず、対応していないプロパティでは
    // 空で返る。失敗しても診断全体は続ける（S01 は「空欄 = エラー」と断定しない）
    let appearances: KeyedMetrics[] | null = null;
    try {
      const rows = await ask(current, ["searchAppearance"], SMALL_ROW_LIMIT);
      appearances = rows.length > 0 ? toKeyed(rows) : null;
      if (appearances === null) notes.push("「検索での見え方」の行が返りませんでした（リッチリザルトの対象が無いか、この期間に該当が無い）");
    } catch {
      notes.push("「検索での見え方」は取得できませんでした（この項目に対応していないプロパティの可能性）");
    }

    if (queriesCurrent.length >= ROW_LIMIT) notes.push(`検索クエリは上位 ${ROW_LIMIT} 件で打ち切っています`);
    if (pagesCurrent.length >= ROW_LIMIT) notes.push(`ページは上位 ${ROW_LIMIT} 件で打ち切っています`);

    return {
      dataset: {
        siteUrl,
        range: { current, previous },
        totals: { current: totalsOf(totalsCurrent), previous: totalsOf(totalsPrevious) },
        byDate: toKeyed(byDate),
        queries: { current: toKeyed(queriesCurrent), previous: toKeyed(queriesPrevious) },
        pages: { current: toKeyed(pagesCurrent), previous: toKeyed(pagesPrevious) },
        devices: { current: toKeyed(devicesCurrent), previous: toKeyed(devicesPrevious) },
        countries: { current: toKeyed(countriesCurrent), previous: toKeyed(countriesPrevious) },
        appearances,
        notes,
      },
      notes,
    };
  } catch (err) {
    notes.push(`Search Console のデータを取得できませんでした（${err instanceof Error ? err.message : "エラー"}）`);
    return { dataset: null, notes };
  }
}
