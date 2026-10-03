/**
 * 「まず、これをしてください」ブロックの導出。純関数（生成 AI 不使用）。
 *
 * 点数と改善点の一覧だけでは「高いのか低いのか」「何から手をつけるのか」が
 * 分からない（利用者の指摘 2026-10-02）。レポートの先頭に、
 *   1. いまの点数の水準（高い / 平均的 / 低い）と、今すぐの件数を伝える 1 文
 *   2. 最初にやること 1 件（項目名 + 具体的な対応方法を一言で）
 *   3. 優先度ごとの件数（今すぐ / 要改善 / 後回しで OK）
 * を出す。サイト・ページ（src/lib/report）と MEO（src/lib/maps）で同じ関数を使う。
 */
import type { Grade } from "@/lib/ui/palette";
import {
  URGENCY_LABELS,
  URGENCY_NOTES,
  URGENCY_ORDER,
  urgencyIndex,
  type Urgency,
} from "./urgency";

/** 改善項目の最小の形（Improvement / MeoImprovement のどちらでも渡せる） */
export interface ActionItem {
  id: string;
  label: string;
  categoryLabel: string;
  gainLabel: string;
  urgency: Urgency;
  /** どう直すか。無い項目は「対応方法は改善提案（詳細）をご覧ください」になる */
  advice?: string;
  /** site のみ: 該当ページ数 */
  affectedPages?: number;
  totalPages?: number;
}

export interface ActionTier {
  urgency: Urgency;
  label: string;
  count: number;
  note: string;
}

export interface ActionPlan {
  /** いまの水準と今すぐの件数を伝える 1 文 */
  verdict: string;
  /** 最初にやること。改善点が無ければ null */
  first: ActionItem | null;
  /** 優先度ごとの件数（今すぐ → 要改善 → 放置 OK の順） */
  tiers: ActionTier[];
  /** 改善点の総数（warn + fail） */
  total: number;
  /** 最初にやる 1 件に添える効果の見出し（既定「見込み効果」。サイト診断は「該当」など） */
  effectHeading: string;
}

/** グレード → 水準の言い方。「危険」「致命的」などの断定語は使わない（design-spec §3.4） */
export const LEVEL_LABELS: Record<Grade, string> = {
  A: "高い水準",
  B: "良い水準",
  C: "平均的な水準",
  D: "低めの水準",
  E: "低い水準",
};

/** 最初にやる 1 件: 今すぐ → 要改善 → 放置 OK の順、同じ段なら元の並び（見込み効果の降順）を保つ */
export function firstActionOf<T extends ActionItem>(items: readonly T[]): T | null {
  let best: T | null = null;
  for (const item of items) {
    if (best === null || urgencyIndex(item.urgency) < urgencyIndex(best.urgency)) best = item;
  }
  return best;
}

export function countTiers(items: readonly ActionItem[]): ActionTier[] {
  return URGENCY_ORDER.map((urgency) => ({
    urgency,
    label: URGENCY_LABELS[urgency],
    count: items.filter((i) => i.urgency === urgency).length,
    note: URGENCY_NOTES[urgency],
  }));
}

export interface ActionPlanInput {
  items: readonly ActionItem[];
  /** 総合スコア（0〜100）。null なら水準の文を省く（MEO で未測定のとき） */
  overall: number | null;
  grade: Grade | null;
  /** 主語。「このページ」「このサイト」「このプロフィール」 */
  subject: string;
  /** 水準の文の前に置く 1 文（例「10 ページを診断し、課題 12 件を見つけました。」）。点数が無い診断で使う */
  intro?: string;
  /** 最初の 1 件の効果の見出し。既定「見込み効果」 */
  effectHeading?: string;
}

export function buildActionPlan(input: ActionPlanInput): ActionPlan {
  const tiers = countTiers(input.items);
  const now = tiers[0].count;
  const soon = tiers[1].count;
  const later = tiers[2].count;
  const total = now + soon + later;

  const level =
    input.overall !== null && input.grade !== null
      ? `${input.subject}の総合 ${input.overall} 点は${LEVEL_LABELS[input.grade]}です。`
      : "";

  let status: string;
  if (total === 0) {
    status = "主要項目はすべて満たしています。いま急いで直すものはありません。";
  } else if (now > 0) {
    status = `今すぐ直す項目が ${now} 件あります。ほかの ${total - now} 件より先に、まず下の 1 件から手をつけてください。`;
  } else if (soon > 0) {
    status = `今すぐ直す項目はありません。要改善 ${soon} 件を効果の大きい順に進めれば十分です${
      later > 0 ? `（残り ${later} 件は後回しで問題ありません）` : ""
    }。`;
  } else {
    status = `今すぐ直す項目はありません。残る ${later} 件は点数への影響が小さく、後回しで問題ありません。`;
  }

  return {
    verdict: `${input.intro ?? ""}${level}${status}`,
    first: firstActionOf(input.items),
    tiers,
    total,
    effectHeading: input.effectHeading ?? "見込み効果",
  };
}
