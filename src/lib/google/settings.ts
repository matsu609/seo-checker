/**
 * ユーザーごとの連携設定（どの Search Console サイト / どの GA4 プロパティを見るか）。
 * サーバー専用。
 *
 * 保存先は Clerk の privateMetadata。ブラウザからは読めず、データベースも要らない。
 * 中身は外部（Clerk）から返ってくる任意の JSON なので、読むたびに zod で検証し、
 * 壊れていれば「未設定」として扱う（例外は投げない）。
 */
import { auth, clerkClient } from "@clerk/nextjs/server";
import { z } from "zod";
import { GoogleLinkError } from "./errors";

/** privateMetadata の中でこのアプリが使うキー */
export const METADATA_KEY = "googleLink";

const LinkSettingsSchema = z.object({
  /** Search Console のサイト URL（例 "https://example.com/" や "sc-domain:example.com"） */
  searchConsoleSiteUrl: z.string().min(1).max(500).optional(),
  /** GA4 のプロパティ ID（数字のみ） */
  ga4PropertyId: z.string().regex(/^\d{1,20}$/).optional(),
});

export type LinkSettings = z.infer<typeof LinkSettingsSchema>;

export const EMPTY_SETTINGS: LinkSettings = {};

/** 任意の値を LinkSettings にする。壊れていれば空（純関数・テスト用に公開） */
export function parseLinkSettings(value: unknown): LinkSettings {
  const parsed = LinkSettingsSchema.safeParse(value);
  return parsed.success ? parsed.data : EMPTY_SETTINGS;
}

async function requireUserId(): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw new GoogleLinkError("ログインが必要です。", "unauthenticated");
  return userId;
}

/** 保存済みの連携設定。未ログイン・未設定・壊れている場合はすべて空を返す */
export async function getLinkSettings(): Promise<LinkSettings> {
  let userId: string;
  try {
    userId = await requireUserId();
  } catch {
    return EMPTY_SETTINGS;
  }
  try {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    return parseLinkSettings((user.privateMetadata as Record<string, unknown>)?.[METADATA_KEY]);
  } catch {
    return EMPTY_SETTINGS;
  }
}

/**
 * 連携設定を保存する。渡したキーだけ書き換える。
 * 値に null を渡すとそのキーを消す（Clerk の privateMetadata は深くマージされるため、
 * 消すには明示的に null を入れる必要がある）。
 */
export async function setLinkSettings(
  patch: Partial<Record<keyof LinkSettings, string | null>>,
): Promise<LinkSettings> {
  const userId = await requireUserId();

  // 保存する前に、値の形を検証する（不正な値をメタデータに残さない）
  const toValidate: Record<string, string> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (typeof v === "string") toValidate[k] = v;
  }
  const check = LinkSettingsSchema.safeParse(toValidate);
  if (!check.success) {
    throw new GoogleLinkError("選択した値の形式が正しくありません。", "not_selected");
  }

  const client = await clerkClient();
  const user = await client.users.updateUserMetadata(userId, {
    privateMetadata: { [METADATA_KEY]: patch },
  });
  return parseLinkSettings((user.privateMetadata as Record<string, unknown>)?.[METADATA_KEY]);
}

/** 選択済みの Search Console サイト。未選択なら例外 */
export async function requireSearchConsoleSite(): Promise<string> {
  const { searchConsoleSiteUrl } = await getLinkSettings();
  if (!searchConsoleSiteUrl) {
    throw new GoogleLinkError(
      "見る対象の Search Console のサイトが選ばれていません。設定画面で選択してください。",
      "not_selected",
    );
  }
  return searchConsoleSiteUrl;
}
