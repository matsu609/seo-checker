/**
 * 無料診断の前に登録してもらう「見込み客の情報」（担当者名・会社名・電話・店舗の種類）。
 * 純粋な型・検証だけ（クライアントからも読める）。
 *
 * 保存先は Clerk のユーザーのメタデータ（データベースは持たない）:
 *   - 登録フォームは `unsafeMetadata.lead` に載せる（クライアントから書ける唯一の場所）
 *   - あとから直した場合は `/api/account/lead` が `publicMetadata.lead` に書く（サーバーだけが書ける）
 * 読むときは publicMetadata → unsafeMetadata の順（直した値が勝つ）。
 * メールアドレスとパスワードは Clerk のアカウントそのもの。電話は SMS 認証をしないので文字として持つ。
 */
import { z } from "zod";

export const LEAD_KEY = "lead";

/** 店舗の種類（登録フォームの選択肢。増やすときはここだけ） */
export const STORE_TYPES = [
  "飲食店",
  "クリニック・医院・歯科",
  "美容サロン・理容",
  "整体・整骨・治療院",
  "小売店",
  "不動産",
  "士業・コンサルティング",
  "教室・スクール",
  "宿泊・観光",
  "建築・リフォーム",
  "その他",
] as const;
export type StoreType = (typeof STORE_TYPES)[number];

export const CONTACT_NAME_MAX = 60;
export const COMPANY_MAX = 100;
export const PHONE_MAX = 30;

export const LeadProfileSchema = z.object({
  contactName: z.string().trim().min(1, "担当者名を入力してください").max(CONTACT_NAME_MAX),
  company: z.string().trim().min(1, "会社名（屋号）を入力してください").max(COMPANY_MAX),
  phone: z
    .string()
    .trim()
    .min(1, "電話番号を入力してください")
    .max(PHONE_MAX)
    .regex(/^[0-9０-９+＋()（）\-‐－ー\s]+$/, "電話番号は数字とハイフンで入力してください"),
  storeType: z.enum(STORE_TYPES, { message: "店舗の種類を選んでください" }),
});
export type LeadProfile = z.infer<typeof LeadProfileSchema>;

function pick(metadata: unknown): LeadProfile | null {
  if (typeof metadata !== "object" || metadata === null) return null;
  const raw = (metadata as Record<string, unknown>)[LEAD_KEY];
  const parsed = LeadProfileSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/** Clerk のメタデータから登録情報を読む。直した値（public）が登録時の値（unsafe）より優先。無ければ null */
export function leadFromMetadata(publicMetadata: unknown, unsafeMetadata: unknown = null): LeadProfile | null {
  return pick(publicMetadata) ?? pick(unsafeMetadata);
}
