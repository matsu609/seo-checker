"use client";

/**
 * 診断中の進捗パネル（no-print）。
 * /api/site-audit の NDJSON 進捗行を「取得 N / 発見 M」として出し、いつでも中止できる。
 * 無料診断の free/ProgressPanel と同じ形にして、画面ごとの見え方を揃えている。
 */
import { Button, ProgressBar } from "@/components/ui";
import { PHASE_LABELS, type AuditProgress as Progress } from "@/lib/audit/types";
import { fmt, formatClock, truncateMiddle } from "@/lib/report";

export function AuditProgress({
  progress,
  elapsedMs,
  onAbort,
}: {
  progress: Progress | null;
  elapsedMs: number;
  onAbort: () => void;
}) {
  const discovered = progress?.discovered ?? 0;
  const fetched = progress?.fetched ?? 0;
  const headline = progress ? PHASE_LABELS[progress.phase] : "サイトの構成を調べています";
  // 分母（発見済み URL 数）が決まるまでは不定バーにする
  const indeterminate = !progress || progress.phase !== "crawl" || discovered <= 0;

  return (
    <section
      className="no-print mb-6 rounded-sm border border-line bg-panel p-4"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[13px] font-bold text-ink">{headline}…</p>
        <p className="text-[12px] tabular-nums text-muted">経過 {formatClock(elapsedMs)}</p>
      </div>

      <ProgressBar
        className="mt-3"
        value={fetched}
        max={Math.max(discovered, 1)}
        indeterminate={indeterminate}
        label={
          <span className="text-[13px] text-ink">
            取得 <span className="font-bold tabular-nums">{fmt(fetched)}</span> / 発見{" "}
            <span className="font-bold tabular-nums">{fmt(discovered)}</span> ページ
            {progress && progress.analyzed > 0 && (
              <span className="ml-2 text-[12px] text-muted">解析済み {fmt(progress.analyzed)} 件</span>
            )}
            {progress && progress.failed > 0 && (
              <span className="ml-2 text-[12px] text-muted">失敗 {fmt(progress.failed)} 件</span>
            )}
          </span>
        }
      />

      {progress?.url && (
        <p className="mt-2 break-all text-[12px] text-muted">現在: {truncateMiddle(progress.url, 64)}</p>
      )}

      <div className="mt-3">
        <Button variant="secondary" size="sm" onClick={onAbort}>
          中止
        </Button>
      </div>
    </section>
  );
}
