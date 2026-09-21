/**
 * お客様カルテの型と検証（クライアントでも読める）。
 *
 * 答えは「設問 ID → 文字列」の辞書 1 つだけ。設問が増減しても保存の形は変わらない
 * （知らない ID は読み飛ばし、空文字は未回答として扱う）。
 */
import { z } from "zod";
import { COMMON_QUESTIONS, INDUSTRY_QUESTIONS, findQuestion, questionsFor } from "./questions";
import type { StoreType } from "@/lib/free/lead";

/** 1 つの答えの最大文字数（設問ごとの上限とは別の、安全側の天井） */
export const ANSWER_HARD_MAX = 600;
/** 一度に送れる設問数（想定は 14 問。壊れた入力で巨大な辞書を送らせない） */
export const MAX_ANSWER_KEYS = 60;

export const KarteAnswersSchema = z
  .record(z.string().max(80), z.string().max(ANSWER_HARD_MAX))
  .refine((v) => Object.keys(v).length <= MAX_ANSWER_KEYS, { message: "設問が多すぎます" });

export type KarteAnswers = z.infer<typeof KarteAnswersSchema>;

export interface KarteRecord {
  answers: KarteAnswers;
  /** 会社名・業種は保存時の写し（運営者の集計画面が Clerk を引かずに済むように） */
  company: string;
  storeType: string;
  updatedAt: string | null;
}

export const EMPTY_KARTE: KarteRecord = { answers: {}, company: "", storeType: "", updatedAt: null };

/**
 * 保存する前に整える。
 * - 知らない設問 ID は捨てる（画面の作り替えでゴミが残らないように）
 * - 設問ごとの上限で切り詰める
 * - 空白だけの答えは「未回答」として消す
 */
export function sanitizeAnswers(raw: KarteAnswers): KarteAnswers {
  const out: KarteAnswers = {};
  for (const [id, value] of Object.entries(raw)) {
    const q = findQuestion(id);
    if (!q) continue;
    const trimmed = value.trim().slice(0, Math.min(q.max, ANSWER_HARD_MAX));
    if (trimmed) out[id] = trimmed;
  }
  return out;
}

/** 回答の進み具合（その業種の設問数に対して、いくつ答えたか） */
export interface KarteProgress {
  answered: number;
  total: number;
  /** 0〜100 の整数 */
  percent: number;
}

export function karteProgress(answers: KarteAnswers, storeType: StoreType | null | undefined): KarteProgress {
  const questions = questionsFor(storeType);
  const answered = questions.filter((q) => (answers[q.id] ?? "").trim().length > 0).length;
  const total = questions.length;
  return { answered, total, percent: total === 0 ? 0 : Math.round((answered / total) * 100) };
}

/** 集計画面が使う「設問 ID の全部」（共通 → 業種別の順） */
export function allQuestionIds(): string[] {
  const industry = Object.values(INDUSTRY_QUESTIONS).flat();
  return [...COMMON_QUESTIONS.map((q) => q.id), ...industry.map((q) => q.id)];
}
