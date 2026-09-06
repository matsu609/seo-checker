import type { SiteAnalysisResult, SiteCheckSummary } from "@/lib/analyzer/types";
import { Book, StatusIcon } from "./Icons";

function tone(score: number): string {
  if (score >= 80) return "text-pass";
  if (score >= 50) return "text-warn";
  return "text-fail";
}

function path(url: string): string {
  try {
    const u = new URL(url);
    return u.pathname === "/" ? "/（トップ）" : u.pathname;
  } catch {
    return url;
  }
}

const DISCOVERY_LABEL: Record<SiteAnalysisResult["discovery"], string> = {
  sitemap: "sitemap.xml から",
  links: "トップページの内部リンクから",
  "entry-only": "入力URLのみ",
};

export function SiteReport({ result }: { result: SiteAnalysisResult }) {
  const mixed = result.checks.filter((c) => c.spread === "mixed");
  const siteWide = result.checks.filter(
    (c) => c.spread === "uniform" && (c.counts.fail > 0 || c.counts.warn > 0),
  );

  return (
    <>
      <section className="print-card rounded-2xl bg-panel p-5 shadow-sm ring-1 ring-line sm:p-6">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-stretch">
          <div className="flex flex-col items-center justify-center sm:min-w-40">
            <div className={`text-6xl font-bold tabular-nums ${tone(result.overall)}`}>
              {result.overall}
            </div>
            <div className="mt-1 text-sm text-muted">サイト平均</div>
            <div className="text-xs text-muted">{result.pages.length} ページ</div>
          </div>
          <div className="grid flex-1 grid-cols-2 gap-3">
            {result.categories.map((c) => (
              <div key={c.id} className="rounded-xl bg-surface px-3 py-4 text-center">
                <div className={`text-2xl font-bold tabular-nums ${tone(c.score)}`}>{c.score}</div>
                <div className="mt-1 text-xs text-muted">{c.label}</div>
                {c.min !== c.max && (
                  <div className="mt-0.5 text-[11px] text-muted tabular-nums">
                    {c.min}〜{c.max}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        <dl className="mt-5 grid gap-1 border-t border-line pt-4 text-xs text-muted sm:grid-cols-2">
          <div className="flex gap-2">
            <dt className="shrink-0">サイト</dt>
            <dd className="break-all text-ink">{result.origin}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="shrink-0">ページ収集</dt>
            <dd className="text-ink">{DISCOVERY_LABEL[result.discovery]}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="shrink-0">診断日時</dt>
            <dd className="text-ink">{new Date(result.fetchedAt).toLocaleString("ja-JP")}</dd>
          </div>
        </dl>
        {(result.notes.length > 0 || result.failures.length > 0) && (
          <ul className="mt-3 space-y-1 text-xs text-muted">
            {result.notes.map((n) => (
              <li key={n}>※ {n}</li>
            ))}
            {result.failures.map((f) => (
              <li key={f.url}>
                ※ {path(f.url)} は診断できませんでした（{f.message}）
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="print-card rounded-2xl bg-panel p-5 shadow-sm ring-1 ring-line sm:p-6">
        <h2 className="text-xl font-bold">ページ別スコア</h2>
        <p className="mt-1 text-sm text-muted">
          構造化データ・メタ情報・見出し・コンテンツはページごとの内容で決まるため、同じサイトでもページによって点数が変わります。
        </p>
        <div className="mt-4 -mx-2 overflow-x-auto px-2">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th className="py-2 text-left font-medium">ページ</th>
                <th className="py-2 text-right font-medium">総合</th>
                {result.categories.map((c) => (
                  <th key={c.id} className="py-2 text-right font-medium whitespace-nowrap">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.pages.map((p) => (
                <tr key={p.url} className="border-b border-line/60 last:border-0">
                  <td className="py-2 pr-3">
                    <span className="break-all">{path(p.url)}</span>
                  </td>
                  <td
                    className={`py-2 text-right font-bold tabular-nums ${tone(p.overall)}`}
                  >
                    {p.overall}
                  </td>
                  {result.categories.map((c) => (
                    <td
                      key={c.id}
                      className={`py-2 text-right tabular-nums ${tone(p.scores[c.id])}`}
                    >
                      {p.scores[c.id]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="print-card rounded-2xl bg-panel p-5 shadow-sm ring-1 ring-line sm:p-6">
        <h2 className="text-xl font-bold">改善提案</h2>
        <p className="mt-1 text-sm text-muted">
          全ページ共通の問題はテンプレートを 1 箇所直せば全部直ります。ページによって違う項目は、そのページだけの対応で済みます。
        </p>

        <CheckGroup
          title="ページによって差がある項目"
          description="ここに出ている項目が、ページ間でスコアが変わる原因です。"
          checks={mixed}
          emptyText="ページ間で判定が分かれた項目はありません。"
          total={result.pages.length}
        />
        <CheckGroup
          title="全ページ共通の問題"
          description="サイト全体で同じ状態です。共通テンプレートやサイト設定を直してください。"
          checks={siteWide}
          emptyText="全ページ共通で問題になっている項目はありません。"
          total={result.pages.length}
        />
      </section>
    </>
  );
}

function CheckGroup({
  title,
  description,
  checks,
  emptyText,
  total,
}: {
  title: string;
  description: string;
  checks: SiteCheckSummary[];
  emptyText: string;
  total: number;
}) {
  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mt-0.5 text-xs text-muted">{description}</p>
      {checks.length === 0 ? (
        <p className="mt-3 rounded-xl bg-surface px-4 py-3 text-sm text-muted">{emptyText}</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {checks.map((c) => {
            const worst = c.counts.fail > 0 ? "fail" : c.counts.warn > 0 ? "warn" : "pass";
            return (
              <li key={c.id}>
                <div className="flex items-start gap-2.5">
                  <StatusIcon status={worst} className="mt-0.5 h-5 w-5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] leading-snug">{c.label}</div>
                    <div className="mt-0.5 text-xs text-muted">
                      {total} ページ中 {c.affected.length} ページで該当
                    </div>
                    {c.affected.length > 0 && (
                      <ul className="mt-1 space-y-0.5 text-xs text-muted">
                        {c.affected.map((a) => (
                          <li key={a.url} className="break-all">
                            ・{path(a.url)}
                            {a.evidence ? ` — ${a.evidence}` : ""}
                          </li>
                        ))}
                      </ul>
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
            );
          })}
        </ul>
      )}
    </div>
  );
}
