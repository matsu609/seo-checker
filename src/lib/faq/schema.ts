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

export const FaqGenerationSchema = z.object({
  faqs: z.array(FaqItemSchema).describe("重要度の高い順に 6〜10 件"),
});

export type FaqItem = z.infer<typeof FaqItemSchema>;
export type FaqGeneration = z.infer<typeof FaqGenerationSchema>;

/** UI で承認・編集の状態を持たせた FAQ */
export interface EditableFaq extends FaqItem {
  id: string;
  approved: boolean;
}
