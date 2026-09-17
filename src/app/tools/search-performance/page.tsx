import { redirect } from "next/navigation";

/**
 * Search Console の実測（検索パフォーマンス）は提供を終了した（利用者の決定 2026-09-17:
 * Google Search Console / GA4 は使わない）。代わりに、連携の要らない
 * 「検索パフォーマンス（推定）」へ転送する。古いリンクとブックマークのためだけに残す。
 */
export default function Page() {
  redirect("/tools/search-estimate");
}
