/**
 * SERP をまとめて引いて順位にする（サーバー専用）。自動計測（Cron）と画面の計測で同じ形。
 *
 * 1 語 1 回の SERP から自社・競合・AI Overviews を全部読む（measure.ts）。鍵や上限の失敗は
 * 全語で同じように起きるので、最初の 1 件で打ち切って fatal に載せる。
 */
import { runPool } from "@/lib/async/pool";
import { measureFromSerp } from "./measure";
import type { RankMeasureItem, SerpDevice } from "./types";
import { SerpError } from "@/lib/serp/serpapi";
import type { SerpProvider } from "@/lib/serp/types";

export interface BatchTarget {
  keyword: string;
  device: SerpDevice;
  location?: string;
  projectDomain: string;
  competitorDomains: readonly string[];
}

export interface BatchOptions {
  concurrency?: number;
  includeAioText?: boolean;
  /** これを過ぎたら新しい語を始めない（結果は undefined = 未計測） */
  deadline?: number;
  signal?: AbortSignal;
}

export interface BatchResult {
  items: (RankMeasureItem | undefined)[];
  /** 鍵・上限の失敗（以後の語も失敗するので呼び出し側は止める） */
  fatal: { code: string; message: string } | null;
}

export async function measureBatch(provider: SerpProvider, targets: readonly BatchTarget[], options: BatchOptions = {}): Promise<BatchResult> {
  let fatal: BatchResult["fatal"] = null;
  const items = await runPool(targets, options.concurrency ?? 3, async (t): Promise<RankMeasureItem | undefined> => {
    if (fatal) return undefined;
    if (options.deadline && Date.now() > options.deadline) return undefined;
    if (options.signal?.aborted) return undefined;
    try {
      const serp = await provider.search({ q: t.keyword, device: t.device, ...(t.location ? { location: t.location } : {}) });
      const m = measureFromSerp({ ...serp, raw: null }, {
        projectDomain: t.projectDomain,
        competitorDomains: t.competitorDomains,
        includeAioText: options.includeAioText ?? false,
        ...(t.location ? { location: t.location } : {}),
      });
      return { ok: true, ...m };
    } catch (err) {
      if (err instanceof SerpError) {
        if (err.code === "auth" || err.code === "rate_limit") fatal = fatal ?? { code: err.code, message: err.message };
        return { ok: false, keyword: t.keyword, device: t.device, error: err.message };
      }
      console.error("[rank] 計測に失敗", err instanceof Error ? err.message : err);
      return { ok: false, keyword: t.keyword, device: t.device, error: "検索結果の取得に失敗しました" };
    }
  });
  return { items, fatal };
}
