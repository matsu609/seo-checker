/**
 * 月次レポートの組み立て（純粋関数。テストで固定する）。
 *
 * 入力は各機能の保存済みデータを最小限の形にしたもの（collect.ts が作る）。ここで外部 API は叩かない。
 * 「当月の最後の値」と「前月の最後の値」を並べ、差から「来月やること」を決める。
 */
import { monthRangeJst, previousMonthKey } from "@/lib/time/jst";
import type { ListingStates } from "@/lib/listings/profile";
import type { ActivitySection, AiSection, ListingsStoreSection, MeoStoreSection, MonitorSection, MonthlyReport, RankChange, RankSection, ReportDelta, ReviewsSection, SeoSection } from "./types";

export interface RankSource {
  keywords: { id: string; keyword: string }[];
  snapshots: { keywordId: string; takenOn: string; rank: number | null }[];
}

export interface MeoSource {
  name: string;
  /** 古い順 */
  reports: { generatedAt: string; score: number | null; rating: number | null; reviews: number | null; photos: number; rank: { keyword: string; rank: number | null }[] }[];
}

export interface GeoSource {
  /** 自社ブランドの観測だけ */
  observations: { executedAt: string; mentioned: boolean; cited: boolean }[];
}

export interface SeoSource {
  /** 新しい順 */
  runs: { createdAt: string; source: "manual" | "auto"; quick: number | null; errors: number; warnings: number; improved: number | null; worsened: number | null }[];
}

export interface ListingsSource {
  stores: { name: string; states: ListingStates }[];
}

export interface ReviewsSource {
  responses: { createdAt: string; rating: number | null; isLow: boolean; clicked: boolean }[];
}

export interface ReportSources {
  siteDomain: string | null;
  rank: RankSource | null;
  meo: MeoSource[] | null;
  geo: GeoSource | null;
  seo: SeoSource | null;
  listings: ListingsSource | null;
  reviews: ReviewsSource | null;
  monitor: { checkedAt: string; incidents: number; critical: number } | null;
  activity: ActivitySection;
}

const inRange = (iso: string, start: string, end: string) => iso >= start && iso < end;
const last = <T,>(list: readonly T[]): T | null => (list.length > 0 ? list[list.length - 1] : null);
const avg = (values: readonly number[]): number | null => (values.length === 0 ? null : Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10);
const delta = (current: number | null, previous: number | null): ReportDelta => ({ current, previous });

function rankSection(src: RankSource, month: { start: string; end: string }, prev: { start: string; end: string }): RankSection | null {
  const lastIn = (keywordId: string, range: { start: string; end: string }) => {
    const rows = src.snapshots.filter((s) => s.keywordId === keywordId && inRange(`${s.takenOn}T00:00:00.000Z`, range.start, range.end)).sort((a, b) => a.takenOn.localeCompare(b.takenOn));
    return last(rows);
  };
  const changes: (RankChange & { hasCurrent: boolean; hasPrevious: boolean })[] = [];
  for (const k of src.keywords) {
    const cur = lastIn(k.id, month);
    const pre = lastIn(k.id, prev);
    if (!cur && !pre) continue;
    changes.push({ keyword: k.keyword, from: pre ? pre.rank : null, to: cur ? cur.rank : null, hasCurrent: cur !== null, hasPrevious: pre !== null });
  }
  if (changes.length === 0) return null;
  const current = changes.filter((c) => c.hasCurrent);
  const previous = changes.filter((c) => c.hasPrevious);
  const top10 = (list: readonly RankChange[], key: "from" | "to") => list.filter((c) => c[key] !== null && (c[key] as number) <= 10).length;
  const avgOf = (list: readonly RankChange[], key: "from" | "to") => avg(list.map((c) => c[key]).filter((v): v is number => v !== null));
  const value = (r: number | null) => r ?? 101;
  // 上がった・下がったは、前月と当月の両方に記録がある語だけ（前月に記録が無い語は「新しく測った」）
  const moved = changes.filter((c) => c.hasCurrent && c.hasPrevious && value(c.from) !== value(c.to));
  const up = moved.filter((c) => value(c.to) < value(c.from)).sort((a, b) => value(b.from) - value(b.to) - (value(a.from) - value(a.to))).slice(0, 5);
  const down = moved.filter((c) => value(c.to) > value(c.from)).sort((a, b) => value(b.to) - value(b.from) - (value(a.to) - value(a.from))).slice(0, 5);
  return {
    measured: current.length,
    top10: delta(top10(current, "to"), previous.length > 0 ? top10(previous, "from") : null),
    avgRank: delta(avgOf(current, "to"), previous.length > 0 ? avgOf(previous, "from") : null),
    up: up.map(({ keyword, from, to }) => ({ keyword, from, to })),
    down: down.map(({ keyword, from, to }) => ({ keyword, from, to })),
  };
}

function meoSection(stores: MeoSource[], month: { start: string; end: string }, prev: { start: string; end: string }): MeoStoreSection[] | null {
  const out: MeoStoreSection[] = [];
  for (const s of stores) {
    const cur = last(s.reports.filter((r) => inRange(r.generatedAt, month.start, month.end)));
    const pre = last(s.reports.filter((r) => inRange(r.generatedAt, prev.start, prev.end)));
    if (!cur && !pre) continue;
    const prevRank = new Map((pre?.rank ?? []).map((r) => [r.keyword, r.rank]));
    out.push({
      name: s.name,
      score: delta(cur?.score ?? null, pre?.score ?? null),
      rating: delta(cur?.rating ?? null, pre?.rating ?? null),
      reviews: delta(cur?.reviews ?? null, pre?.reviews ?? null),
      photos: delta(cur?.photos ?? null, pre?.photos ?? null),
      rank: (cur?.rank ?? []).map((r) => ({ keyword: r.keyword, from: prevRank.has(r.keyword) ? (prevRank.get(r.keyword) ?? null) : null, to: r.rank })),
    });
  }
  return out.length > 0 ? out : null;
}

function aiSection(src: GeoSource, month: { start: string; end: string }, prev: { start: string; end: string }): AiSection | null {
  const cur = src.observations.filter((o) => inRange(o.executedAt, month.start, month.end));
  const pre = src.observations.filter((o) => inRange(o.executedAt, prev.start, prev.end));
  if (cur.length === 0 && pre.length === 0) return null;
  const rate = (list: typeof cur, key: "mentioned" | "cited") => (list.length === 0 ? null : Math.round((list.filter((o) => o[key]).length / list.length) * 1000) / 10);
  return { observations: cur.length, mentionRate: delta(rate(cur, "mentioned"), rate(pre, "mentioned")), citeRate: delta(rate(cur, "cited"), rate(pre, "cited")) };
}

function seoSection(src: SeoSource, month: { start: string; end: string }): SeoSection | null {
  const cur = src.runs.find((r) => inRange(r.createdAt, month.start, month.end)) ?? null;
  const before = src.runs.find((r) => r.createdAt < month.start) ?? null;
  if (!cur && !before) return null;
  return {
    runAt: cur?.createdAt ?? null,
    source: cur?.source ?? null,
    quick: delta(cur?.quick ?? null, before?.quick ?? null),
    errors: delta(cur?.errors ?? null, before?.errors ?? null),
    warnings: delta(cur?.warnings ?? null, before?.warnings ?? null),
    improved: cur?.improved ?? null,
    worsened: cur?.worsened ?? null,
  };
}

function listingsSection(src: ListingsSource): ListingsStoreSection[] | null {
  const out = src.stores.map((s) => {
    const states = Object.values(s.states);
    const count = (status: string) => states.filter((x) => x.status === status).length;
    return {
      name: s.name,
      live: count("live"),
      submitted: count("submitted"),
      todo: count("todo"),
      total: states.filter((x) => x.status !== "skip").length,
      missing: states.filter((x) => x.check?.result === "missing").length,
      mismatch: states.filter((x) => x.check?.result === "mismatch").length,
    };
  });
  return out.length > 0 ? out : null;
}

function reviewsSection(src: ReviewsSource, month: { start: string; end: string }, prev: { start: string; end: string }): ReviewsSection | null {
  const cur = src.responses.filter((r) => inRange(r.createdAt, month.start, month.end));
  const pre = src.responses.filter((r) => inRange(r.createdAt, prev.start, prev.end));
  if (cur.length === 0 && pre.length === 0) return null;
  const ratings = (list: typeof cur) => list.map((r) => r.rating).filter((r): r is number => r !== null);
  return {
    responses: delta(cur.length, pre.length),
    averageRating: delta(avg(ratings(cur)), avg(ratings(pre))),
    low: cur.filter((r) => r.isLow).length,
    clicks: cur.filter((r) => r.clicked).length,
  };
}

/** 「来月やること」（数字から。優先順） */
export function suggestActions(r: Omit<MonthlyReport, "actions" | "summary">): string[] {
  const out: string[] = [];
  if (r.monitor && r.monitor.critical > 0) out.push(`サイトの重大な事故 ${r.monitor.critical} 件を直す（noindex・エラー・転送・SSL）。検索からの流入が止まる`);
  if (r.listings) {
    const missing = r.listings.reduce((a, s) => a + s.missing, 0);
    if (missing > 0) out.push(`掲載が消えた媒体 ${missing} 件を登録し直す（掲載の確認で「見つからない」になったもの）`);
  }
  if (r.rank && r.rank.down.length > 0) out.push(`順位が下がった語（${r.rank.down.map((d) => d.keyword).join("・")}）のランディングページを見直す。競合の上位ページと比べる`);
  if (r.seo) {
    if ((r.seo.worsened ?? 0) > 0) out.push(`精密診断で悪化した ${r.seo.worsened} 点を直す（履歴の「前回との比較」）`);
    if ((r.seo.errors.current ?? 0) > 0) out.push(`精密診断の重大な課題 ${r.seo.errors.current} 件を減らす`);
  }
  for (const s of r.meo ?? []) {
    if (s.score.current !== null && s.score.current < 80) out.push(`${s.name}: マップ診断 ${s.score.current} 点。未対応の項目（写真・投稿・返信）から着手`);
    if (s.reviews.current !== null && s.reviews.previous !== null && s.reviews.current <= s.reviews.previous) out.push(`${s.name}: 口コミが増えていない。店内 QR のアンケートで口コミを集める`);
    if (s.photos.current !== null && s.photos.previous !== null && s.photos.current <= s.photos.previous) out.push(`${s.name}: 写真が増えていない。毎週 1 枚は追加する`);
    const outOf = s.rank.filter((k) => k.to === null).map((k) => k.keyword);
    if (outOf.length > 0) out.push(`${s.name}: マップ検索で圏外の語（${outOf.join("・")}）。カテゴリ・説明文・投稿にその語を入れる`);
  }
  if (r.activity.scheduled === 0) out.push("来月の投稿を予約する（週 1 回。投稿の画面で AI の下書き → 承認して予約）");
  if (r.listings) {
    const todo = r.listings.reduce((a, s) => a + s.todo, 0);
    if (todo > 0) out.push(`未登録の媒体 ${todo} 件に登録する（掲載の画面の「一括登録」）`);
  }
  if (!r.rank && r.siteDomain) out.push("順位計測にキーワードを登録する（毎週火曜に自動で測って、この表に載る）");
  if (!r.ai) out.push("AI 検索モニタリングにプロンプトを登録する（ChatGPT / Gemini / Claude / Perplexity / AI Overviews / AI モード で引用される割合を測る）");
  if (r.reviews && r.reviews.low > 0) out.push(`低評価の回答 ${r.reviews.low} 件に対応する（口コミの画面。対応状態を「対応済み」に）`);
  return out.slice(0, 8);
}

const fmtDelta = (d: ReportDelta, unit = "", invert = false): string => {
  if (d.current === null) return "—";
  if (d.previous === null) return `${d.current}${unit}`;
  const diff = Math.round((d.current - d.previous) * 10) / 10;
  const good = invert ? diff < 0 : diff > 0;
  const sign = diff > 0 ? "+" : diff === 0 ? "±" : "";
  return `${d.current}${unit}（前月 ${d.previous}${unit}、${sign}${diff}${diff === 0 ? "" : good ? " 改善" : " 悪化"}）`;
};

/** 要点（メールの本文と画面の先頭。1 行ずつ） */
export function summarize(r: Omit<MonthlyReport, "summary">): string[] {
  const lines: string[] = [];
  if (r.rank) lines.push(`検索順位: 10 位以内 ${fmtDelta(r.rank.top10, " 語")}、平均 ${fmtDelta(r.rank.avgRank, " 位", true)}。上がった語 ${r.rank.up.length}・下がった語 ${r.rank.down.length}`);
  for (const s of r.meo ?? []) lines.push(`${s.name}: マップ診断 ${fmtDelta(s.score, " 点")}、口コミ ${fmtDelta(s.reviews, " 件")}、評価 ${fmtDelta(s.rating)}`);
  if (r.ai) lines.push(`AI 検索: 参照される割合 ${fmtDelta(r.ai.mentionRate, "%")}、引用 ${fmtDelta(r.ai.citeRate, "%")}（観測 ${r.ai.observations} 回）`);
  if (r.seo && r.seo.runAt) lines.push(`精密診断（${r.seo.source === "auto" ? "自動" : "手動"}）: トップの採点 ${fmtDelta(r.seo.quick, " 点")}、重大な課題 ${fmtDelta(r.seo.errors, " 件", true)}${r.seo.improved !== null ? `。直った ${r.seo.improved}・悪化 ${r.seo.worsened}` : ""}`);
  if (r.listings) {
    const live = r.listings.reduce((a, s) => a + s.live, 0);
    const total = r.listings.reduce((a, s) => a + s.total, 0);
    const missing = r.listings.reduce((a, s) => a + s.missing, 0);
    lines.push(`掲載: ${live} / ${total} 媒体に掲載済み${missing > 0 ? `。消えた掲載 ${missing} 件` : ""}`);
  }
  if (r.reviews) lines.push(`口コミ支援: 回答 ${fmtDelta(r.reviews.responses, " 件")}、低評価 ${r.reviews.low} 件、投稿ボタン ${r.reviews.clicks} 回`);
  if (r.monitor) lines.push(`サイト監視: 事故 ${r.monitor.incidents} 件（重大 ${r.monitor.critical}）`);
  lines.push(`今月の動き: 投稿 ${r.activity.posts} 件、変化の知らせ ${r.activity.alerts} 件、自動の順位計測 ${r.activity.autoRankRuns} 回`);
  return lines;
}

export function buildMonthlyReport(src: ReportSources, month: string, now: Date): MonthlyReport {
  const range = monthRangeJst(month);
  const prev = monthRangeJst(previousMonthKey(month));
  const base: Omit<MonthlyReport, "actions" | "summary"> = {
    month,
    generatedAt: now.toISOString(),
    siteDomain: src.siteDomain,
    rank: src.rank ? rankSection(src.rank, range, prev) : null,
    meo: src.meo ? meoSection(src.meo, range, prev) : null,
    ai: src.geo ? aiSection(src.geo, range, prev) : null,
    seo: src.seo ? seoSection(src.seo, range) : null,
    listings: src.listings ? listingsSection(src.listings) : null,
    reviews: src.reviews ? reviewsSection(src.reviews, range, prev) : null,
    monitor: src.monitor ? { checkedAt: src.monitor.checkedAt, incidents: src.monitor.incidents, critical: src.monitor.critical } : ({ checkedAt: null, incidents: 0, critical: 0 } as MonitorSection | null),
    activity: src.activity,
  };
  if (!src.monitor) base.monitor = null;
  const actions = suggestActions(base);
  const summary = summarize({ ...base, actions });
  return { ...base, actions, summary };
}

/** メールの本文（純粋） */
export function reportMailText(r: MonthlyReport, monthLabel: string): string {
  const lines = [`${monthLabel}の月次レポートです。${r.siteDomain ? `対象: ${r.siteDomain}` : ""}`, "", "■ 要点", ...r.summary.map((s) => `・${s}`)];
  if (r.actions.length > 0) lines.push("", "■ 来月やること（優先順）", ...r.actions.map((a, i) => `${i + 1}. ${a}`));
  lines.push("", "数字の内訳と PDF は画面の「月次レポート」で見られます。");
  return lines.join("\n");
}
