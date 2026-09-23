/**
 * ユーザーごとの Search Console の設定（どのサイトを見るか）。サーバー専用。
 *
 * 保存先は Clerk の privateMetadata（キー googleLink。r89 以前と同じ場所なので、
 * 当時選んでいたサイトがあればそのまま引き継がれる）。ブラウザからは読めず、
 * データベースも要らない。中身は外部から返ってくる任意の JSON なので、読むたびに
 * zod で検証し、壊れていれば「未設定」として扱う（例外は投げない）。
 */
import { auth, clerkClient } from "@clerk/nextjs/server";
import { z } from "zod";
import { GoogleLinkError } from "../errors";

/** privateMetadata の中でこのアプリが使うキー */
export const METADATA_KEY = "googleLink";

/** "https://example.com/" または "sc-domain:example.com" */
export const SiteUrlSchema = z.string().min(1).max(500);

const SettingsSchema = z.object({
  searchConsoleSiteUrl: SiteUrlSchema.optional(),
});

export type SearchConsoleSettings = z.infer<typeof SettingsSchema>;

/** 任意の値を設定にする。壊れていれば空（純関数・テスト用に公開）。関係の無いキーは捨てる */
export function parseSearchConsoleSettings(value: unknown): SearchConsoleSettings {
  const parsed = SettingsSchema.safeParse(value);
  if (!parsed.success) return {};
  return parsed.data.searchConsoleSiteUrl ? { searchConsoleSiteUrl: parsed.data.searchConsoleSiteUrl } : {};
}

async function requireUserId(): Promise<string> {
  const { userId } = await auth();
  if (!userId) throw new GoogleLinkError("ログインが必要です。", "unauthenticated");
  return userId;
}

/** 保存済みの設定。未ログイン・未設定・壊れている場合はすべて空を返す */
export async function getSearchConsoleSettings(): Promise<SearchConsoleSettings> {
  try {
    const userId = await requireUserId();
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    return parseSearchConsoleSettings((user.privateMetadata as Record<string, unknown>)?.[METADATA_KEY]);
  } catch {
    return {};
  }
}

/**
 * 見るサイトを保存する。null で選択を外す（privateMetadata は深くマージされるため、
 * 消すには明示的に null を入れる）。
 */
export async function setSearchConsoleSite(siteUrl: string | null): Promise<SearchConsoleSettings> {
  const userId = await requireUserId();
  const client = await clerkClient();
  const user = await client.users.updateUserMetadata(userId, {
    privateMetadata: { [METADATA_KEY]: { searchConsoleSiteUrl: siteUrl } },
  });
  return parseSearchConsoleSettings((user.privateMetadata as Record<string, unknown>)?.[METADATA_KEY]);
}

/** 選択済みのサイト。未選択なら例外 */
export async function requireSearchConsoleSite(): Promise<string> {
  const { searchConsoleSiteUrl } = await getSearchConsoleSettings();
  if (!searchConsoleSiteUrl) {
    throw new GoogleLinkError("見る対象の Search Console のサイトが選ばれていません。この画面の「対象サイト」で選んでください。", "not_selected");
  }
  return searchConsoleSiteUrl;
}
