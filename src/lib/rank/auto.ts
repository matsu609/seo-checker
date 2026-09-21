/**
 * 順位計測の自動化（毎週）の決めごと。純粋関数だけを置く（テストで固定する）。
 *
 * - 何語まで自動で測るかはプランで決める（SerpApi の実費が契約数に比例するため）
 * - 対象は「設定に登録したホームページ」のキーワード（user_stores の写し）。登録が古い順に上限まで
 * - 前回（直前の自動計測または手動計測）と比べて大きく下がった語を知らせる
 */
import type { PlanId } from "@/lib/plans/catalog";
import { rankKeywordsStore, RankKeywordSchema, type RankKeyword, type RankSnapshot } from "./store";
import { ProjectsSchema, type Project } from "@/lib/store/projects";
import { z } from "zod";

export { rankKeywordsStore };

/** 1 週間に自動で測る語数の上限（プランごと） */
export const RANK_AUTO_LIMITS: Record<PlanId, number> = { free: 0, light: 30, standard: 100, premium: 300 };

/**
 * その人に適用する上限。運用者（ADMIN_EMAILS）は契約が無くてもいちばん上の段として扱う
 * （ツールは全部使える立場なのに、自動計測だけ 0 語になると画面の説明と食い違う）。
 * 定期処理と画面の両方がこれを使う。
 */
export function rankAutoLimit(plan: PlanId, staff: boolean): number {
  return RANK_AUTO_LIMITS[plan] || (staff ? RANK_AUTO_LIMITS.premium : 0);
}

/** 「急落」とみなす下げ幅（順位） */
export const RANK_DROP_MIN = 5;
/** ここより上にいた語が落ちたら知らせる */
export const RANK_TOP_WATCH = 10;

export interface AutoTarget {
  keyword: RankKeyword;
  projectDomain: string;
  competitorDomains: string[];
}

/** user_stores の写し → 自動計測の対象（登録が古い順に limit まで） */
export function selectAutoTargets(stores: { projects: unknown; rankKeywords: unknown }, limit: number): AutoTarget[] {
  if (limit <= 0) return [];
  const projects = ProjectsSchema.safeParse(stores.projects);
  const keywords = z.array(RankKeywordSchema).safeParse(stores.rankKeywords);
  if (!projects.success || !keywords.success) return [];
  const byId = new Map<string, Project>(projects.data.map((p) => [p.id, p]));
  const out: AutoTarget[] = [];
  const sorted = [...keywords.data].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (const k of sorted) {
    const project = byId.get(k.projectId);
    if (!project || !project.domain || !k.keyword.trim()) continue;
    out.push({ keyword: k, projectDomain: project.domain, competitorDomains: project.competitors.flatMap((c) => c.domains).filter(Boolean) });
    if (out.length >= limit) break;
  }
  return out;
}

export type DropKind = "drop" | "out" | "lost_top";

export interface RankDrop {
  keywordId: string;
  keyword: string;
  device: string;
  from: number;
  /** 圏外は null */
  to: number | null;
  kind: DropKind;
}

/**
 * 今回と前回の順位から、知らせるべき下落を拾う。
 *   out      … 圏内から圏外へ
 *   lost_top … RANK_TOP_WATCH 位以内から外れた
 *   drop     … RANK_DROP_MIN 以上下がった
 * 前回が無い語・前回も圏外の語は対象外（上がった語は知らせない。月次レポートで見る）。
 */
export function detectRankDrops(current: readonly RankSnapshot[], previous: ReadonlyMap<string, RankSnapshot>, keywords: readonly RankKeyword[]): RankDrop[] {
  const byId = new Map(keywords.map((k) => [k.id, k]));
  const out: RankDrop[] = [];
  for (const s of current) {
    const prev = previous.get(s.keywordId);
    const k = byId.get(s.keywordId);
    if (!prev || !k || prev.rank === null) continue;
    const from = prev.rank;
    const base = { keywordId: s.keywordId, keyword: k.keyword, device: k.device, from };
    if (s.rank === null) {
      out.push({ ...base, to: null, kind: "out" });
      continue;
    }
    if (from <= RANK_TOP_WATCH && s.rank > RANK_TOP_WATCH) {
      out.push({ ...base, to: s.rank, kind: "lost_top" });
      continue;
    }
    if (s.rank - from >= RANK_DROP_MIN) out.push({ ...base, to: s.rank, kind: "drop" });
  }
  return out.sort((a, b) => (a.to ?? 999) - a.from - ((b.to ?? 999) - b.from)).reverse();
}

const DEVICE_JA: Record<string, string> = { desktop: "PC", mobile: "スマホ" };

/** 知らせの本文（純粋） */
export function buildRankAlert(domain: string, drops: readonly RankDrop[]): { title: string; body: string } {
  const lines = drops.slice(0, 20).map((d) => {
    const dev = DEVICE_JA[d.device] ?? d.device;
    if (d.kind === "out") return `・${d.keyword}（${dev}）: ${d.from} 位 → 圏外`;
    if (d.kind === "lost_top") return `・${d.keyword}（${dev}）: ${d.from} 位 → ${d.to} 位（${RANK_TOP_WATCH} 位以内から外れました）`;
    return `・${d.keyword}（${dev}）: ${d.from} 位 → ${d.to} 位`;
  });
  const more = drops.length > 20 ? `\n…ほか ${drops.length - 20} 語` : "";
  return {
    title: `${domain} の順位が下がった語が ${drops.length} 件あります`,
    body: `今週の自動計測で、前回より大きく下がった語です。ランディングページの内容と、競合の動きを確認してください。\n${lines.join("\n")}${more}`,
  };
}

/** 今回のスナップショットから「語ごとの直前の値」を引く（同じ日の分は除く） */
export function previousByKeyword(history: readonly RankSnapshot[], takenOn: string): Map<string, RankSnapshot> {
  const out = new Map<string, RankSnapshot>();
  for (const s of history) {
    if (s.takenOn >= takenOn) continue;
    const cur = out.get(s.keywordId);
    if (!cur || cur.takenOn < s.takenOn) out.set(s.keywordId, s);
  }
  return out;
}
