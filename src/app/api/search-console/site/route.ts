/**
 * POST /api/search-console/site
 * 「Google サーチコンソール連携」で見るサイトを保存する（Clerk の privateMetadata）。
 *
 * 保存するのは、ログイン中の利用者の Google アカウントで**所有権が確認済みのサイトだけ**。
 * 文字列をそのまま保存すると、他人のサイトの URL を入れられてしまうため、
 * その場で sites.list を引いて照合する。
 */
import { z } from "zod";
import { requireAuth } from "@/lib/auth/guard";
import { googleErrorResponse, GoogleLinkError } from "@/lib/google/errors";
import { createSearchConsoleClient } from "@/lib/google/search-console/client";
import { SiteUrlSchema, setSearchConsoleSite } from "@/lib/google/search-console/settings";
import { usableSites } from "@/lib/google/search-console/setup";

export const runtime = "nodejs";

const BodySchema = z.object({
  /** null は「選択を外す」 */
  siteUrl: SiteUrlSchema.nullable(),
});

export async function POST(request: Request) {
  const denied = await requireAuth({ feature: "search-console" });
  if (denied) return denied;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "リクエスト形式が不正です" }, { status: 400 });
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "入力が正しくありません" }, { status: 400 });
  }
  const { siteUrl } = parsed.data;

  try {
    if (siteUrl) {
      const sites = usableSites(await createSearchConsoleClient().listSites());
      if (!sites.some((s) => s.siteUrl === siteUrl)) {
        throw new GoogleLinkError("このサイトは、接続している Google アカウントの Search Console で所有権が確認できませんでした。", "forbidden");
      }
    }
    const settings = await setSearchConsoleSite(siteUrl);
    return Response.json({ siteUrl: settings.searchConsoleSiteUrl ?? null }, { headers: { "cache-control": "no-store" } });
  } catch (err) {
    return googleErrorResponse(err);
  }
}
