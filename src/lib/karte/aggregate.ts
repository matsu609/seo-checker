/**
 * カルテの集計（純関数）。運営者の画面が使う。
 *
 * 「業界のことを分かっている」を作るための材料は、1 人の答えではなく**同じ設問への複数の答え**。
 * だから顧客ごとではなく**設問ごとに並べる**（3 人目で同じ言葉が出てきたら、それが次の機能）。
 */
import { findQuestion, OPERATOR_ONLY_IDS } from "./questions";
import { allQuestionIds, type KarteAnswers } from "./types";

export interface KarteSource {
  userId: string;
  company: string;
  storeType: string;
  updatedAt: string | null;
  answers: KarteAnswers;
}

export interface GroupedAnswer {
  userId: string;
  company: string;
  storeType: string;
  updatedAt: string | null;
  value: string;
}

export interface GroupedQuestion {
  id: string;
  label: string;
  why: string;
  /** 運営者だけが読む設問（要望・過去の不満）。画面で先頭に出す */
  operatorOnly: boolean;
  answers: GroupedAnswer[];
}

/**
 * 設問ごとに答えを束ねる。答えが 1 件も無い設問は落とす。
 * 並びは「運営者だけが読む設問（= 次に作るものの材料）」が先。
 */
export function groupByQuestion(rows: readonly KarteSource[]): GroupedQuestion[] {
  const out: GroupedQuestion[] = [];
  for (const id of allQuestionIds()) {
    const meta = findQuestion(id);
    if (!meta) continue;
    const answers = rows
      .map((r) => ({ userId: r.userId, company: r.company, storeType: r.storeType, updatedAt: r.updatedAt, value: (r.answers[id] ?? "").trim() }))
      .filter((a) => a.value.length > 0);
    if (answers.length === 0) continue;
    out.push({ id, label: meta.label, why: meta.why, operatorOnly: OPERATOR_ONLY_IDS.includes(id), answers });
  }
  return out.sort((a, b) => Number(b.operatorOnly) - Number(a.operatorOnly));
}

/** 業種ごとの人数（どの業種に強くなってきたかが分かる） */
export function countByStoreType(rows: readonly KarteSource[]): { storeType: string; count: number }[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    if (Object.keys(r.answers).length === 0) continue;
    const key = r.storeType.trim() || "（未設定）";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return [...map.entries()].map(([storeType, count]) => ({ storeType, count })).sort((a, b) => b.count - a.count);
}
