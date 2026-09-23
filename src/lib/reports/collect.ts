/**
 * 月次レポートの材料を各機能の保存済みデータから集める（サーバー専用。外部 API は叩かない）。
 *
 * テーブルが無い・空の機能は null にして、あるものだけでレポートを作る（ダミーの数字は入れない）。
 */
import { z } from "zod";
import { getUserStore } from "@/lib/db/user-stores";
import { promptObservations } from "@/lib/geo/aggregate";
import { listBrands, listObservations } from "@/lib/geo/store";
import { listListings } from "@/lib/listings/store";
import { allReportsForPlace } from "@/lib/maps/history";
import { listStores } from "@/lib/maps/stores";
import { latestSnapshots } from "@/lib/monitor/store";
import { countNotificationsBetween } from "@/lib/notifications/store";
import { countPublishedBetween, countScheduled } from "@/lib/posts/store";
import { listRankSnapshots } from "@/lib/rank/server-store";
import { mergeSnapshots, RankKeywordSchema, RankSnapshotSchema } from "@/lib/rank/store";
import { listForms } from "@/lib/reviews/forms";
import { listResponses } from "@/lib/reviews/responses";
import { diffSheets } from "@/lib/seo-analysis/diff";
import { getRun, listRuns } from "@/lib/seo-analysis/runs";
import { loadSharedSettings } from "@/lib/settings/server";
import { RANK_KEYWORDS_STORE } from "@/lib/settings/shared";
import { jstDateKey, monthRangeJst, previousMonthKey } from "@/lib/time/jst";
import type { ReportSources } from "./build";

async function quiet<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    console.warn(`[reports] ${label} を読めませんでした（テーブル未作成か空）`, err instanceof Error ? err.message : err);
    return null;
  }
}

export async function collectReportSources(userId: string, month: string): Promise<ReportSources> {
  const range = monthRangeJst(month);
  const prev = monthRangeJst(previousMonthKey(month));
  const settings = await loadSharedSettings(userId);
  const siteDomain = settings.project?.domain ?? null;

  const rank = await quiet("順位", async () => {
    const keywords = z.array(RankKeywordSchema).safeParse(await getUserStore(userId, RANK_KEYWORDS_STORE));
    if (!keywords.success || keywords.data.length === 0) return null;
    const manual = z.array(RankSnapshotSchema).safeParse(await getUserStore(userId, "rankSnapshots"));
    const auto = await listRankSnapshots(userId, { sinceDate: jstDateKey(new Date(prev.start)) });
    const snapshots = mergeSnapshots(manual.success ? manual.data : [], auto);
    return { keywords: keywords.data.map((k) => ({ id: k.id, keyword: k.keyword })), snapshots: snapshots.map((s) => ({ keywordId: s.keywordId, takenOn: s.takenOn, rank: s.rank })), autoDates: new Set(auto.filter((s) => `${s.takenOn}T00:00:00.000Z` >= range.start && `${s.takenOn}T00:00:00.000Z` < range.end).map((s) => s.takenOn)).size };
  });

  const own = (await quiet("店舗", () => listStores(userId)))?.filter((s) => s.role === "own") ?? [];
  const meo = await quiet("MEO", async () => {
    if (own.length === 0) return null;
    const out = [];
    for (const s of own) {
      const reports = (await allReportsForPlace(userId, s.placeId, 20)).sort((a, b) => a.generatedAt.localeCompare(b.generatedAt));
      out.push({
        name: s.name,
        reports: reports.map((r) => ({ generatedAt: r.generatedAt, score: r.score.score, rating: r.detail.rating, reviews: r.detail.ratingCount, photos: r.detail.photoCount, rank: (r.rank?.keywords ?? []).map((k) => ({ keyword: k.keyword, rank: k.error ? null : k.rank })) })),
      });
    }
    return out;
  });

  const geo = await quiet("AI 検索", async () => {
    const brands = await listBrands(userId);
    const ownIds = new Set(brands.filter((b) => b.type === "own").map((b) => b.id));
    if (ownIds.size === 0) return null;
    // 前月の頭から対象月の終わりまでを、月の範囲で引く（2026-09-23）。以前は「今日から 70 日」で、
    // 月末近くに前月分を手動で作ると前月の頭が抜けていた。
    // 数えるのは**登録したプロンプトへの回答だけ**（ダッシュボードのブランドシェアと同じ母集団。仕様書 §3.3）。
    // 以前はキーワード側の観測（本文の無い順位計測を含む）まで分母に入り、参照率が実際より低く出ていた
    const rows = promptObservations(await listObservations(userId, { start: prev.start, end: range.end })).filter((o) => ownIds.has(o.brandId));
    return { observations: rows.map((o) => ({ executedAt: o.executedAt, mentioned: o.mentioned, cited: o.cited })) };
  });

  const seo = await quiet("精密診断", async () => {
    const runs = (await listRuns(userId)).filter((r) => r.status !== "failed");
    if (runs.length === 0) return null;
    const inMonth = runs.find((r) => r.createdAt >= range.start && r.createdAt < range.end) ?? null;
    const before = runs.find((r) => r.createdAt < range.start) ?? null;
    const out = [];
    let beforeDetail = before ? await getRun(userId, before.id) : null;
    if (inMonth) {
      const detail = await getRun(userId, inMonth.id);
      if (detail) {
        const d = beforeDetail ? diffSheets(beforeDetail.sheet, detail.sheet, { prev: beforeDetail.audit, next: detail.audit }) : null;
        out.push({ createdAt: inMonth.createdAt, source: inMonth.source, quick: detail.sheet.site.quick?.score ?? null, errors: detail.sheet.site.bySeverity.error, warnings: detail.sheet.site.bySeverity.warning, improved: d ? d.improved.length : null, worsened: d ? d.worsened.length : null });
      }
    }
    if (beforeDetail) {
      out.push({ createdAt: before!.createdAt, source: before!.source, quick: beforeDetail.sheet.site.quick?.score ?? null, errors: beforeDetail.sheet.site.bySeverity.error, warnings: beforeDetail.sheet.site.bySeverity.warning, improved: null, worsened: null });
      beforeDetail = null;
    }
    return out.length > 0 ? { runs: out } : null;
  });

  const listings = await quiet("掲載", async () => {
    const records = await listListings(userId);
    if (records.length === 0) return null;
    const names = new Map(own.map((s) => [s.placeId, s.name]));
    return { stores: records.map((r) => ({ name: r.profile.name || names.get(r.placeId) || r.placeId, states: r.states })) };
  });

  const reviews = await quiet("口コミ支援", async () => {
    const forms = await listForms(userId);
    if (forms.length === 0) return null;
    const responses = [];
    for (const f of forms) {
      const rows = await listResponses(f.id, { from: prev.start, to: range.end });
      responses.push(...rows.map((r) => ({ createdAt: r.createdAt, rating: r.rating, isLow: r.isLow, clicked: r.clickedReviewAt !== null })));
    }
    return { responses };
  });

  const monitor = await quiet("サイト監視", async () => {
    if (!settings.project) return null;
    const origin = new URL(settings.project.startUrl || `https://${settings.project.domain}/`).origin;
    const latest = (await latestSnapshots(userId, origin, 1))[0];
    return latest ? { checkedAt: latest.checkedAt, incidents: latest.incidents.length, critical: latest.incidents.filter((i) => i.severity === "critical").length } : null;
  });

  const posts = (await quiet("投稿", () => countPublishedBetween(userId, range.start, range.end))) ?? 0;
  const scheduled = (await quiet("予約", () => countScheduled(userId))) ?? 0;
  const counts = (await quiet("お知らせ", () => countNotificationsBetween(userId, range.start, range.end))) ?? {};
  const alerts = ["rank_drop", "site_incident", "listing_check", "post_failed", "review_low"].reduce((a, k) => a + (counts[k] ?? 0), 0);

  return {
    siteDomain,
    rank: rank ? { keywords: rank.keywords, snapshots: rank.snapshots } : null,
    meo,
    geo,
    seo,
    listings,
    reviews,
    monitor,
    activity: { posts, scheduled, alerts, rediagnosis: counts.seo_rediagnosis ?? 0, autoRankRuns: rank?.autoDates ?? 0 },
  };
}
