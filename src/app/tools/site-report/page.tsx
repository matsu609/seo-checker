import { redirect } from "next/navigation";

/**
 * GA4 を使う画面は提供を終了した（利用者の決定 2026-09-17: Google Search Console / GA4 は使わない）。
 * 代わりに、自前の計測タグで取る「アクセス解析」へ転送する。古いリンクとブックマークのためだけに残す。
 */
export default function Page() {
  redirect("/tools/analytics");
}
