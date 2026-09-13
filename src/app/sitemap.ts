/**
 * 検索エンジンに知らせるページ。無料診断と規約類だけ（ログインが要る画面は出さない）。
 */
import type { MetadataRoute } from "next";
import { FREE_PATHS } from "@/lib/free/upsell";
import { PUBLIC_APP_ORIGIN } from "@/lib/site";

const PATHS = [...Object.values(FREE_PATHS), "/terms", "/privacy", "/legal/tokushoho"];

export default function sitemap(): MetadataRoute.Sitemap {
  return PATHS.map((path) => ({
    url: path === "/" ? `${PUBLIC_APP_ORIGIN}/` : `${PUBLIC_APP_ORIGIN}${path}`,
    changeFrequency: path === "/" || path === "/meo" ? ("weekly" as const) : ("yearly" as const),
    priority: path === "/" ? 1 : path === "/meo" ? 0.8 : 0.3,
  }));
}
