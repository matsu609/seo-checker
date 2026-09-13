/**
 * 検索エンジンに見せる範囲。
 *
 * 無料診断（/ と /meo）は誰にでも渡せる公開ページなので、そこと規約類だけを開ける。
 * 管理画面・ツール・API・来店客のアンケート（/r/<slug>）は、ログインが要るか
 * お客様ごとの URL なので、インデックスさせない（利用者の決定 2026-09-13）。
 */
import type { MetadataRoute } from "next";
import { PUBLIC_APP_ORIGIN } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/meo", "/terms", "/privacy", "/legal/tokushoho"],
        disallow: ["/tools/", "/settings", "/admin", "/plans", "/start", "/api/", "/r/", "/sign-in", "/sign-up", "/sso-callback"],
      },
    ],
    sitemap: `${PUBLIC_APP_ORIGIN}/sitemap.xml`,
  };
}
