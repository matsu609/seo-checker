/**
 * Search Console の実測（検索パフォーマンス）の画面は提供を終了した
 * （利用者の決定 2026-09-17: Google Search Console / GA4 は使わない）。
 * `/tools/search-performance` は「検索パフォーマンス（推定）」へ転送するので、この部品はどこからも使われない。
 * 部品と `src/lib/google/search-console/` の削除は利用者の許可を得てから行う（docs/dev/OPERATIONS.md の残タスク）。
 */
import Link from "next/link";
import { Callout } from "@/components/ui/Callout";

export function SearchPerformanceView() {
  return (
    <Callout tone="info" title="この機能は提供を終了しました">
      <p>
        検索の状況は、Google 連携の要らない{" "}
        <Link href="/tools/search-estimate" className="text-accent underline">
          検索パフォーマンス（推定）
        </Link>{" "}
        でご覧ください。
      </p>
    </Callout>
  );
}
