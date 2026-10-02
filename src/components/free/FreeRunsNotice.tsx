/**
 * 無料診断の画面の上に出す「今月の診断回数」（利用者の指示 2026-10-02「ツールの上の方に今月の回数が表示されていたら
 * めちゃめちゃいい。不正利用されていたら分かるし、営業が頑張っているかも分かる」）。
 * 上限に達したら、翌月まで使えない旨に変わる。
 */
import { Callout } from "@/components/ui/Callout";
import { isFreeExhausted, type FreeRuns } from "@/lib/free/monthly-rules";

function resetLabel(resetsOn: string): string {
  const [, m, d] = resetsOn.split("-").map(Number);
  return `${m} 月 ${d} 日`;
}

export function FreeRunsNotice({ runs, className = "" }: { runs: FreeRuns; className?: string }) {
  if (isFreeExhausted(runs)) {
    return (
      <Callout tone="warn" className={`no-print ${className}`} title={`今月の無料診断は上限（${runs.limit} 回）に達しました`}>
        <p className="leading-relaxed">無料診断は全体で月 {runs.limit} 回までです。{resetLabel(runs.resetsOn)}に回数が戻ります。急ぎであれば運営者にご連絡ください。</p>
      </Callout>
    );
  }
  const ratio = runs.limit > 0 ? Math.min(1, runs.used / runs.limit) : 0;
  return (
    <div className={`no-print flex flex-wrap items-center gap-x-3 gap-y-1 rounded-sm border border-line bg-panel px-3 py-2 text-[12px] text-muted ${className}`} role="status">
      <span>
        今月の診断回数 <span className="text-[14px] font-bold text-ink tabular-nums">{runs.used}</span>
        <span className="tabular-nums"> / {runs.limit} 回</span>
      </span>
      <span className="h-1.5 w-28 overflow-hidden rounded-full bg-surface" aria-hidden="true">
        <span className={`block h-full ${ratio >= 0.8 ? "bg-warn" : "bg-brand"}`} style={{ width: `${Math.round(ratio * 100)}%` }} />
      </span>
      <span>
        残り <span className="font-bold text-ink tabular-nums">{runs.remaining}</span> 回（{resetLabel(runs.resetsOn)}に戻ります）
      </span>
    </div>
  );
}
