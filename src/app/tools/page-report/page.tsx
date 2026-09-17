import { redirect } from "next/navigation";

/**
 * ページ最適化レポート（A2 / A3）はサイドバーから外した（利用者の指示 2026-09-17「本当に必要な機能に絞る」）。
 * 1 ページの採点はクイック診断（/）が無料で出し、直し方は HP 改修提案が同じ診断を走らせたうえで
 * 改修案まで作る。古いリンクとブックマークのために転送だけ残す。API と src/lib/page-report/ は
 * HP 改修提案・PSI・llms.txt が使うのでそのまま。
 */
export default function Page() {
  redirect("/tools/improvement");
}
