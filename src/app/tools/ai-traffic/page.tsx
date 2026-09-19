import { redirect } from "next/navigation";

/**
 * 提供を終了した画面（利用者の決定 2026-09-17: Google Search Console / GA4 は使わない。
 * 自前の計測タグもお客様側の作業が要るので取り下げ）。連携の要らない「順位計測」（検索の推定タブ）へ転送する。
 * 古いリンクとブックマークのためだけに残す。
 */
export default function Page() {
  redirect("/tools/rank");
}
