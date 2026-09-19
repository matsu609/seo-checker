/**
 * AI 分析の出力の形（zod）。Claude の構造化出力とセカンドオピニオンの照合に使う。
 * 主張には必ず事実 ID（facts の id）を付けさせる。
 *
 * 注意: 文字数・件数の上限（max / min）は SDK が API に送らず、説明文のヒントにしか
 * ならない。AI が 1 件でも超えると zod の検証で例外になるため、ここでは上限を書かず、
 * 受け取ったあとに `tidyAnalysis` / `tidyComment` で切り詰める（2026-09-15 の本番エラーの対策）。
 * **件数と長さの指示は `.describe()` と SYSTEM_PROMPT で伝える**（これは API に届く）。
 *
 * 2026-09-19（利用者の指示「トークンを使いすぎ・文章が長すぎ」）: 出力量を約 3 分の 1 にした。
 * 改善案 15 → 6 件、現状 6 → 3 段落、注意 6 → 3、「普通のコンサルが言いそうなこと」
 * （consultant.typical）は読まれないわりに生成量が大きいので**廃止**した。
 */
import { z } from "zod";

const FactIds = z.array(z.string());

export const RecommendationSchema = z.object({
  /** 1 = 最優先（1〜3。範囲外はコード側で丸める） */
  priority: z.number().int().describe("1〜3。1 = 今すぐ・効果が大きい"),
  title: z.string().describe("40 文字以内の見出し"),
  what: z.string().describe("何をどう変えるか。どのページの何を、を 200 文字以内で"),
  why: z.string().describe("事実に基づく理由。100 文字以内"),
  expected: z.string().describe("期待できること。数字を作らない。80 文字以内"),
  effort: z.enum(["low", "medium", "high"]),
  factIds: FactIds.describe("根拠の事実 ID。1〜3 個"),
  /** 書き換え案があるとき（title / description / 見出しなど）。無ければ null */
  before: z.string().nullable().describe("書き換え前の実物。無ければ null"),
  after: z.string().nullable().describe("書き換え案。無ければ null"),
});

export const ClaimSchema = z.object({
  text: z.string(),
  factIds: FactIds,
});

export const AnalysisSchema = z.object({
  headline: z.string().describe("1 文の結論。60 文字以内"),
  situation: z.array(z.string()).describe("現状。2〜3 段落、1 段落 200 文字以内"),
  strengths: z.array(ClaimSchema).describe("強み。最大 3 件、1 件 80 文字以内"),
  weaknesses: z.array(ClaimSchema).describe("弱み。最大 4 件、1 件 80 文字以内"),
  recommendations: z.array(RecommendationSchema).describe("改善案。5〜6 件（多く出さない）"),
  consultant: z.object({
    /** 数字を見たうえで本当に言うべきこと（2026-09-19: typical は廃止） */
    real: z.array(z.string()).describe("この数字を見たからこそ言えること。最大 3 件、1 件 150 文字以内"),
  }),
  cautions: z.array(z.string()).describe("データ不足で断定できない点。最大 3 件、1 件 80 文字以内"),
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
  headline: 120,
  paragraph: 600,
  short: 300,
  long: 500,
  factId: 12,
  factIds: 3,
  situation: 3,
  strengths: 3,
  weaknesses: 4,
  recommendations: 6,
  consultant: 3,
  cautions: 3,
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
      title: cut(r.title, 80),
      what: cut(r.what, LIMITS.long),
      why: cut(r.why, LIMITS.short),
      expected: cut(r.expected, LIMITS.short),
      effort: r.effort,
      factIds: ids(r.factIds),
      before: r.before ? cut(r.before, LIMITS.short) : null,
      after: r.after ? cut(r.after, LIMITS.short) : null,
    })),
    consultant: { real: strs(a.consultant.real, LIMITS.consultant, LIMITS.long) },
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

