/**
 * 検索エンジンに知らせるページ。規約類だけ（クイック診断と管理画面は載せない）。
 * 理由は robots.ts のコメントを参照。
 */
import type { MetadataRoute } from "next";
import { PUBLIC_APP_ORIGIN } from "@/lib/site";

const PATHS = ["/terms", "/privacy", "/legal/tokushoho"];

export default function sitemap(): MetadataRoute.Sitemap {
  return PATHS.map((path) => ({
    url: `${PUBLIC_APP_ORIGIN}${path}`,
    changeFrequency: "yearly" as const,
    priority: 0.3,
  }));
}
