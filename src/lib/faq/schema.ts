import { z } from "zod";

/** AI が返す FAQ 1 件。Claude の構造化出力とクライアント側の型で共用する */
export const FaqItemSchema = z.object({
  question: z.string().describe("ユーザーが実際に検索・質問しそうな自然な日本語の質問文。末尾は「？」"),
  answer: z
    .string()
    .describe(
      "ページ本文に書かれている事実だけを根拠にした、80〜200文字程度の丁寧語の回答。本文に無い情報は書かない",
    ),
});

/**
 * 1 回に返す FAQ の件数の上限（クイック診断・FAQ 提案で共通）。
 *
 * 出力トークン = 費用なので、青天井にしない（利用者の指示 2026-09-22
 * 「FAQ の生成に上限を設けてください」）。12 件を超える FAQ を 1 ページに置いても、
 * AI が引用するのは質問に合う 1〜2 件だけなので、増やす意味も薄い。
 */
export const MAX_FAQ_ITEMS = 12;

export const FaqGenerationSchema = z.object({
  faqs: z.array(FaqItemSchema).max(MAX_FAQ_ITEMS).describe("重要度の高い順に 6〜10 件"),
});

export type FaqItem = z.infer<typeof FaqItemSchema>;
export type FaqGeneration = z.infer<typeof FaqGenerationSchema>;

/** UI で承認・編集の状態を持たせた FAQ */
export interface EditableFaq extends FaqItem {
  id: string;
  approved: boolean;
}

/**
 * FAQ 提案（/tools/faq）の 1 件。
 *
 * クイック診断の FAQ 生成（上の FaqItemSchema）との違いは、
 * **「根拠がどこにあるか」を必ず言わせる**こと。ページに書いていない事実を
 * AI に補わせると、そのまま貼られて嘘が載る。根拠が無いものは答えを作らせず、
 * needs-check として「お客様に確認する質問」の形で返させる。
 */
export const FAQ_BASES = ["page", "karte", "needs-check"] as const;
export type FaqBasis = (typeof FAQ_BASES)[number];

export const FAQ_BASIS_LABELS: Record<FaqBasis, string> = {
  page: "ページ本文",
  karte: "お客様カルテ",
  "needs-check": "要確認",
};

export const FaqProposalSchema = z.object({
  question: z
    .string()
    .min(1)
    .max(120)
    .describe("AI チャットや検索に実際に打ち込まれそうな自然な日本語の質問文。末尾は「？」"),
  answer: z
    .string()
    .max(400)
    .describe(
      "根拠のある事実だけで書いた 80〜200 文字程度の丁寧語の回答。basis が needs-check のときは空文字にする",
    ),
  basis: z
    .enum(FAQ_BASES)
    .describe("回答の根拠。page = ページ本文に書かれている / karte = お客様カルテの記入 / needs-check = どこにも書かれていないので答えを作らない"),
  why: z.string().min(1).max(200).describe("この FAQ を入れると何が変わるか。1 文"),
  priority: z.enum(["high", "medium", "low"]).describe("入れるべき順"),
  /** needs-check のときに、お客様へ何を聞けばよいか */
  askCustomer: z
    .string()
    .max(200)
    .describe("basis が needs-check のときだけ、お客様に確認する内容を 1 文で。それ以外は空文字"),
});

export const FaqProposalSetSchema = z.object({
  summary: z
    .array(z.string().min(1).max(300))
    .min(1)
    .max(4)
    .describe("いまの FAQ の状態と、なぜこの並びにしたかの短い説明。2〜4 行"),
  proposals: z.array(FaqProposalSchema).min(1).max(MAX_FAQ_ITEMS).describe("優先度の高い順"),
});

export type FaqProposal = z.infer<typeof FaqProposalSchema>;
export type FaqProposalSet = z.infer<typeof FaqProposalSetSchema>;
