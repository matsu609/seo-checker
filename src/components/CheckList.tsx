import type { AnalysisResult } from "@/lib/analyzer/types";
import { Book, StatusIcon } from "./Icons";

export function CheckList({ result }: { result: AnalysisResult }) {
  return (
    <section className="print-card rounded-2xl bg-panel p-5 shadow-sm ring-1 ring-line sm:p-6">
      <h2 className="text-xl font-bold">改善提案</h2>
      <p className="mt-1 text-sm text-muted">
        改善が必要な項目には、なぜ必要か・どう直すとよいかを分かりやすく表示しています。
      </p>
      <div className="mt-5 space-y-6">
        {result.categories.map((category) => (
          <div key={category.id}>
            <h3 className="mb-2 text-sm font-semibold text-muted">{category.label}</h3>
            <ul className="space-y-2">
              {category.checks.map((c) => (
                <li key={c.id}>
                  <div className="flex items-start gap-2.5">
                    <StatusIcon status={c.status} className="mt-0.5 h-5 w-5 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] leading-snug">{c.label}</div>
                      {c.evidence && (
                        <div className="mt-0.5 break-words text-xs text-muted">{c.evidence}</div>
                      )}
                    </div>
                  </div>
                  {c.advice && (
                    <div className="mt-2 ml-7 flex gap-2.5 rounded-xl bg-surface px-4 py-3 text-sm leading-relaxed text-muted ring-1 ring-line">
                      <Book className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                      <p>{c.advice}</p>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
