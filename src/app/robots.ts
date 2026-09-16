/**
 * 検索エンジンに見せる範囲。
 *
 * このアプリ（app.seo-checker.tokyo）は契約者と、こちらが URL を渡した相手だけが使う場所。
 * クイック診断（/ と /meo）も検索から見つけられないようにする（利用者の決定 2026-09-13。
 * 「基本、無料診断はユーザーから触れないように」）。集客は紹介サイト seo-checker.tokyo に集める。
 *
 * 開けるのは規約類だけ（Google の OAuth 審査で参照されるため、robots で塞がない）。
 *
 * **`/sitemap.xml` も必ず Allow に入れる。**Disallow: / だけだと、Search Console に
 * 送信したサイトマップを Googlebot が取りに来られず「取得できませんでした」で止まる
 * （2026-09-17 に実際に起きた）。robots.txt は「より長く一致した行が勝つ」ので、
 * `/sitemap.xml`（12 文字）が `Disallow: /`（1 文字）に優先する。
 */
import type { MetadataRoute } from "next";
import { PUBLIC_APP_ORIGIN } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        // より長く一致する Allow が優先されるので、規約類とサイトマップだけが開く
        allow: ["/terms", "/privacy", "/legal/tokushoho", "/sitemap.xml"],
        disallow: ["/"],
      },
    ],
    sitemap: `${PUBLIC_APP_ORIGIN}/sitemap.xml`,
  };
}
