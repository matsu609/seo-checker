/**
 * 改修提案の構造化出力スキーマ。
 *
 * 「そのまま貼れる after」を必ず持たせるのが目的。助言だけの文（「〜を検討してください」）
 * では運用者が結局書く仕事が残るので、after には完成した文字列を入れさせる。
 */
import { z } from "zod";

/** 直す場所 */
export const IMPROVEMENT_AREAS = [
  "title",
  "description",
  "heading",
  "body",
  "structured-data",
  "image-alt",
  "internal-link",
] as const;

export type ImprovementArea = (typeof IMPROVEMENT_AREAS)[number];

export const AREA_LABELS: Record<ImprovementArea, string> = {
  title: "タイトル",
  description: "メタディスクリプション",
  heading: "見出し",
  body: "本文",
  "structured-data": "構造化データ",
  "image-alt": "画像の代替テキスト",
  "internal-link": "内部リンク",
};

export const PRIORITY_LABELS = { high: "高", medium: "中", low: "低" } as const;
export const EFFORT_LABELS = { small: "小", medium: "中", large: "大" } as const;

export const ProposalSchema = z.object({
  area: z.enum(IMPROVEMENT_AREAS).describe("直す場所"),
  headline: z.string().min(1).max(60).describe("何をするかの短い見出し。例「タイトルに地域と業種を入れる」"),
  why: z.string().min(1).max(400).describe("なぜ直すか。顧客にそのまま読み上げられる日本語で 1〜2 文"),
  before: z.string().max(2000).describe("いまページにある内容。無い項目を追加する提案なら空文字"),
  after: z.string().min(1).max(4000).describe("提案する内容。そのままコピーして使える完成形にする"),
  impact: z.string().min(1).max(200).describe("反映すると何が変わるか。効果を保証する書き方はしない"),
  priority: z.enum(["high", "medium", "low"]),
  effort: z.enum(["small", "medium", "large"]).describe("反映の手間"),
});

export type Proposal = z.infer<typeof ProposalSchema>;

export const ImprovementSchema = z.object({
  summary: z
    .array(z.string().min(1).max(300))
    .min(1)
    .max(5)
    .describe("運用者が顧客に読み上げる総評。3〜4 行"),
  proposals: z.array(ProposalSchema).min(1).max(12),
});

export type ImprovementPlan = z.infer<typeof ImprovementSchema>;
