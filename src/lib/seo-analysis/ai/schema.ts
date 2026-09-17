/**
 * AI 分析の出力の形（zod）。Claude の構造化出力とセカンドオピニオンの照合に使う。
 * 主張には必ず事実 ID（facts の id）を付けさせる。
 *
 * 注意: 文字数・件数の上限（max / min）は SDK が API に送らず、説明文のヒントにしか
 * ならない。AI が 1 件でも超えると zod の検証で例外になるため、ここでは上限を書かず、
 * 受け取ったあとに `tidyAnalysis` / `tidyComment` で切り詰める（2026-09-15 の本番エラーの対策）。
 */
import { z } from "zod";

const FactIds = z.array(z.string());

export const RecommendationSchema = z.object({
  /** 1 = 最優先（1〜3。範囲外はコード側で丸める） */
  priority: z.number().int(),
  title: z.string(),
  /** 何を、どう変えるか（具体的に） */
  what: z.string(),
  /** なぜ（事実に基づく理由） */
  why: z.string(),
  /** 期待できること（数字を作らない。方向と根拠） */
  expected: z.string(),
  effort: z.enum(["low", "medium", "high"]),
  factIds: FactIds,
  /** 書き換え案があるとき（title / description / 見出しなど）。無ければ null */
  before: z.string().nullable(),
  after: z.string().nullable(),
});

export const ClaimSchema = z.object({
  text: z.string(),
  factIds: FactIds,
});

export const AnalysisSchema = z.object({
  /** 1 文の結論 */
  headline: z.string(),
  /** 現状分析（段落。2〜6 段落） */
  situation: z.array(z.string()),
  strengths: z.array(ClaimSchema),
  weaknesses: z.array(ClaimSchema),
  /** 改善案（5〜15 件） */
  recommendations: z.array(RecommendationSchema),
  consultant: z.object({
    /** この状況で「普通のコンサル」が言いそうなこと */
    typical: z.array(z.string()),
    /** 数字を見たうえで本当に言うべきこと */
    real: z.array(z.string()),
  }),
  /** 推測・データ不足で断定できない点 */
  cautions: z.array(z.string()),
});

export type Analysis = z.infer<typeof AnalysisSchema>;
export type Recommendation = z.infer<typeof RecommendationSchema>;

/** 画面ごとの短い AI 分析（サイト診断の構成・信頼など） */
export const CommentSchema = z.object({
  summary: z.string(),
  points: z.array(ClaimSchema),
  actions: z.array(z.object({ text: z.string(), factIds: FactIds })),
  cautions: z.array(z.string()),
});

export type Comment = z.infer<typeof CommentSchema>;

/* ───────────── 受け取ったあとの切り詰め（保存する量を縛る） ───────────── */

export const LIMITS = {
  headline: 200,
  paragraph: 1000,
  short: 400,
  long: 800,
  factId: 12,
  factIds: 8,
  situation: 6,
  strengths: 5,
  weaknesses: 8,
  recommendations: 15,
  consultant: 5,
  cautions: 6,
  points: 6,
  actions: 5,
  disagreements: 6,
  additions: 5,
  agreements: 5,
} as const;

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const list = <T,>(a: readonly T[], n: number) => a.slice(0, n);
const ids = (a: readonly string[]) => list(a.map((s) => cut(s.trim(), LIMITS.factId)).filter(Boolean), LIMITS.factIds);
const strs = (a: readonly string[], n: number, len: number) => list(a.map((s) => cut(s, len)).filter(Boolean), n);

export function tidyAnalysis(a: Analysis): Analysis {
  return {
    headline: cut(a.headline, LIMITS.headline),
    situation: strs(a.situation, LIMITS.situation, LIMITS.paragraph),
    strengths: list(a.strengths, LIMITS.strengths).map((s) => ({ text: cut(s.text, LIMITS.short), factIds: ids(s.factIds) })),
    weaknesses: list(a.weaknesses, LIMITS.weaknesses).map((w) => ({ text: cut(w.text, LIMITS.short), factIds: ids(w.factIds) })),
    recommendations: list(a.recommendations, LIMITS.recommendations).map((r) => ({
      priority: Math.min(3, Math.max(1, Math.round(r.priority))) as 1 | 2 | 3,
      title: cut(r.title, 120),
      what: cut(r.what, LIMITS.long),
      why: cut(r.why, LIMITS.short),
      expected: cut(r.expected, LIMITS.short),
      effort: r.effort,
      factIds: ids(r.factIds),
      before: r.before ? cut(r.before, LIMITS.short) : null,
      after: r.after ? cut(r.after, LIMITS.short) : null,
    })),
    consultant: {
      typical: strs(a.consultant.typical, LIMITS.consultant, LIMITS.short),
      real: strs(a.consultant.real, LIMITS.consultant, LIMITS.long),
    },
    cautions: strs(a.cautions, LIMITS.cautions, LIMITS.short),
  };
}

export function tidyComment(c: Comment): Comment {
  return {
    summary: cut(c.summary, LIMITS.long),
    points: list(c.points, LIMITS.points).map((p) => ({ text: cut(p.text, LIMITS.short), factIds: ids(p.factIds) })),
    actions: list(c.actions, LIMITS.actions).map((p) => ({ text: cut(p.text, LIMITS.short), factIds: ids(p.factIds) })),
    cautions: strs(c.cautions, 3, LIMITS.short),
  };
}

/** 検証つきの分析結果（保存する形） */
export interface AnalysisRecord {
  analysis: Analysis;
  model: string;
  generatedAt: string;
  usage: { inputTokens: number; outputTokens: number };
  /** 事実シートに無い数値（画面で注意として出す） */
  unverifiedNumbers: string[];
  /** 事実 ID の引用が facts に無かった件数（0 が正常） */
  unknownFactIds: string[];
}

