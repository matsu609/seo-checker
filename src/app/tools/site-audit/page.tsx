import { redirect } from "next/navigation";

/**
 * サイト診断（A1）は精密分析に統合した（2026-09-15）。
 * 同じクロールと 48 ルールを精密分析の中で実行し、課題一覧・ページ一覧・CSV も
 * 報告書の「詳細」に出す。古いリンクとブックマークのためにここは転送だけ残す。
 */
export default function Page() {
  redirect("/tools/seo-analysis");
}
