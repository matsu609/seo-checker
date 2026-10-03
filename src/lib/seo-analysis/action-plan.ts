/**
 * 精密診断の報告書の「まず、これをしてください」。純関数。
 *
 * 専門家のアドバイス（AI の改善案。priority 1〜3）があればそれを元にし、
 * 無ければ（アドバイス作成中・失敗・古い保存分）サイト診断の 50 ルールから組み立てる。
 * 優先度の 3 段階は無料診断（src/lib/report/urgency.ts）と同じ言葉に合わせる:
 *   priority 1（今すぐ・効果が大きい）= 急ぎで対応 / 2 = 要改善 / 3 = 後回しで OK
 *
 * 利用者の指示 2026-10-03「精密診断にも同じ仕組み・同じデザインで」。
 */
import { buildAuditActionPlan } from "@/lib/audit/urgency";
import type { Issue } from "@/lib/audit/types";
import { buildActionPlan, type ActionItem, type ActionPlan } from "@/lib/report/action-plan";
import type { Urgency } from "@/lib/report/urgency";
import { gradeOf } from "@/lib/ui/grade";
import type { Recommendation } from "./ai/schema";

export function recommendationUrgency(priority: number): Urgency {
  const p = Math.min(3, Math.max(1, Math.round(Number.isFinite(priority) ? priority : 3)));
  return p === 1 ? "now" : p === 2 ? "soon" : "later";
}

const EFFORT_LABELS: Record<Recommendation["effort"], string> = { low: "小", medium: "中", high: "大" };

/** AI の改善案 → 共通の改善項目。並びは priority の昇順（= 急ぎ → 要改善 → 放置 OK）を保つ */
export function recommendationItems(recommendations: readonly Recommendation[]): ActionItem[] {
  return [...recommendations]
    .map((r, i) => ({ r, i }))
    .sort((a, b) => a.r.priority - b.r.priority || a.i - b.i)
    .map(({ r, i }) => ({
      id: `rec-${i}`,
      label: r.title,
      categoryLabel: `専門家のアドバイス・手間 ${EFFORT_LABELS[r.effort]}`,
      gainLabel: r.expected,
      urgency: recommendationUrgency(r.priority),
      advice: r.what,
    }));
}

export interface AnalysisActionPlanInput {
  /** 診断したページ数 */
  analyzedPages: number;
  /** トップページのクイック診断の総合点。無ければ null */
  quickScore: number | null;
  /** 専門家のアドバイス（無ければ null） */
  recommendations: readonly Recommendation[] | null;
  /** サイト診断の課題（クロールの全結果が無い古い保存分は null） */
  issues: readonly Issue[] | null;
}

/**
 * 報告書の先頭ブロック。アドバイスがあればアドバイス、無ければサイト診断、どちらも無ければ null。
 */
export function buildAnalysisActionPlan(input: AnalysisActionPlanInput): ActionPlan | null {
  if (input.recommendations && input.recommendations.length > 0) {
    const items = recommendationItems(input.recommendations);
    const intro = `${input.analyzedPages.toLocaleString("ja-JP")} ページを診断し、専門家のアドバイスは ${items.length.toLocaleString("ja-JP")} 件です。`;
    return buildActionPlan({
      items,
      overall: input.quickScore,
      grade: input.quickScore === null ? null : gradeOf(input.quickScore).grade,
      subject: "トップページ",
      intro,
      effectHeading: "期待できること",
    });
  }
  if (input.issues) {
    return buildAuditActionPlan({ issues: input.issues, analyzedPages: input.analyzedPages });
  }
  return null;
}
