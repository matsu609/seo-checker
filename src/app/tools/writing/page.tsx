import { redirect } from "next/navigation";

/**
 * AI ライティング・エディターは提供を終了した（利用者の決定 2026-09-22:
 * 「SEO・AIO についてこのツールは実行や改善をしない。事実の提示と改善案の提示まで」。
 * 原稿を書くこと自体は改善の実行にあたるため外した）。
 * 同じ SEO の柱で改善案までを出す「ページ改善」へ転送する。
 * 古いリンクとブックマークのためだけに残す。
 */
export default function Page() {
  redirect("/tools/page-improve");
}
