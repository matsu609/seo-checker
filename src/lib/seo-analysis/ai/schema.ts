/**
 * AI 分析の出力の形（zod）。Claude の構造化出力とセカンドオピニオンの照合に使う。
 * 主張には必ず事実 ID（facts の id）を付けさせる。
 */
import { z } from "zod";

const FactIds = z.array(z.string().max(12)).max(8);

export const RecommendationSchema = z.object({
  /** 1 = 最優先 */
  priority: z.number().int().min(1).max(3),
  title: z.string().max(80),
  /** 何を、どう変えるか（具体的に） */
  what: z.string().max(600),
  /** なぜ（事実に基づく理由） */
  why: z.string().max(400),
  /** 期待できること（数字を作らない。方向と根拠） */
  expected: z.string().max(300),
  effort: z.enum(["low", "medium", "high"]),
  factIds: FactIds.min(1),
  /** 書き換え案があるとき（title / description / 見出しなど）。無ければ null */
  before: z.string().max(300).nullable(),
  after: z.string().max(300).nullable(),
});

export const ClaimSchema = z.object({
  text: z.string().max(300),
  factIds: FactIds,
});

export const AnalysisSchema = z.object({
  /** 1 文の結論 */
  headline: z.string().max(160),
  /** 現状分析（段落） */
  situation: z.array(z.string().max(700)).min(2).max(6),
  strengths: z.array(ClaimSchema).max(5),
  weaknesses: z.array(ClaimSchema).max(8),
  recommendations: z.array(RecommendationSchema).min(5).max(15),
  consultant: z.object({
    /** この状況で「普通のコンサル」が言いそうなこと */
    typical: z.array(z.string().max(300)).max(5),
    /** 数字を見たうえで本当に言うべきこと */
    real: z.array(z.string().max(400)).max(5),
  }),
  /** 推測・データ不足で断定できない点 */
  cautions: z.array(z.string().max(300)).max(6),
});

export type Analysis = z.infer<typeof AnalysisSchema>;
export type Recommendation = z.infer<typeof RecommendationSchema>;

/** 画面ごとの短い AI 分析（サイト診断の構成・信頼など） */
export const CommentSchema = z.object({
  summary: z.string().max(400),
  points: z.array(ClaimSchema).min(2).max(6),
  actions: z.array(z.object({ text: z.string().max(300), factIds: FactIds })).min(1).max(5),
  cautions: z.array(z.string().max(200)).max(3),
});

export type Comment = z.infer<typeof CommentSchema>;

export const SecondOpinionSchema = z.object({
  /** 同意する点 */
  agreements: z.array(z.string().max(300)).max(5),
  /** 食い違う点 */
  disagreements: z
    .array(z.object({ topic: z.string().max(120), claude: z.string().max(300), chatgpt: z.string().max(400), factIds: FactIds }))
    .max(6),
  /** Claude が触れていない追加の指摘 */
  additions: z.array(z.object({ text: z.string().max(300), factIds: FactIds })).max(5),
});

export type SecondOpinion = z.infer<typeof SecondOpinionSchema>;

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

export interface SecondOpinionRecord {
  opinion: SecondOpinion;
  model: string;
  generatedAt: string;
}
