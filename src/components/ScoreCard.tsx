import type { AnalysisResult } from "@/lib/analyzer/types";

function tone(score: number): string {
  if (score >= 80) return "text-pass";
  if (score >= 50) return "text-warn";
  return "text-fail";
}

export function ScoreCard({ result }: { result: AnalysisResult }) {
  return (
    <section className="print-card rounded-2xl bg-panel p-5 shadow-sm ring-1 ring-line sm:p-6">
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-stretch">
        <div className="flex flex-col items-center justify-center sm:min-w-40">
          <div className={`text-6xl font-bold tabular-nums ${tone(result.overall)}`}>
            {result.overall}
          </div>
          <div className="mt-1 text-sm text-muted">総合スコア</div>
        </div>
        <div className="grid flex-1 grid-cols-2 gap-3">
          {result.categories.map((c) => (
            <div key={c.id} className="rounded-xl bg-surface px-3 py-4 text-center">
              <div className={`text-2xl font-bold tabular-nums ${tone(c.score)}`}>{c.score}</div>
              <div className="mt-1 text-xs text-muted">{c.label}</div>
            </div>
          ))}
        </div>
      </div>
      <dl className="mt-5 grid gap-1 border-t border-line pt-4 text-xs text-muted sm:grid-cols-2">
        <div className="flex gap-2">
          <dt className="shrink-0">診断URL</dt>
          <dd className="break-all text-ink">{result.page.finalUrl}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="shrink-0">title</dt>
          <dd className="line-clamp-2 text-ink">{result.page.title ?? "（なし）"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="shrink-0">本文</dt>
          <dd className="text-ink">約{result.page.mainTextLength.toLocaleString()}文字</dd>
        </div>
        <div className="flex gap-2">
          <dt className="shrink-0">診断日時</dt>
          <dd className="text-ink">{new Date(result.page.fetchedAt).toLocaleString("ja-JP")}</dd>
        </div>
      </dl>
      {result.notes.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-muted">
          {result.notes.map((n) => (
            <li key={n}>※ {n}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
