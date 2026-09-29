import { redirect } from "next/navigation";

/**
 * サイト診断（A1）は精密診断に統合した（2026-09-15）。
 * 同じクロールとルール判定（数は audit/config.ts の AUDIT_RULE_COUNT）を精密診断の中で実行し、課題一覧・ページ一覧・CSV も
 * 報告書の「詳細」に出す。古いリンクとブックマークのためにここは転送だけ残す。
 */
export default function Page() {
  redirect("/tools/seo-analysis");
}
