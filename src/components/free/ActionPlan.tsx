/**
 * 「まず、これをしてください」ブロック（レポートの先頭）。表示だけ。
 *
 * 点数の水準と急ぎの件数を 1 文で、最初にやること 1 件を具体的な対応方法つきで、
 * 優先度ごとの件数を帯（SegmentBar）で出す。導出は src/lib/report/action-plan.ts。
 * サイト・ページ・MEO の 3 つのレポートと、精密診断（報告書・サイト診断）で同じ部品を使う。
 */
import { SegmentBar } from "@/components/charts";
import { fmt, URGENCY_TONES, type ActionPlan } from "@/lib/report";
import { palette } from "@/lib/ui/palette";
import { Advice, Num, UrgencyBadge } from "./report-parts";

const DEFAULT_NOTE =
  "※ 優先度と文章は診断結果から機械的に決めています（生成 AI は使用していません）。決め方は付録「診断方法と採点基準」をご覧ください。";

export function ActionPlanBlock({
  plan,
  className = "",
  note = DEFAULT_NOTE,
}: {
  plan: ActionPlan;
  className?: string;
  /** 末尾の注記。精密診断など付録の無い画面では差し替える */
  note?: string;
}) {
  const first = plan.first;
  const isSite = first?.affectedPages !== undefined && first?.totalPages !== undefined;
  return (
    <section
      aria-label="まず、これをしてください"
      className={`rounded-sm border-2 border-accent bg-panel p-4 @md:p-5 ${className}`}
    >
      <p className="text-[11px] font-bold tracking-[0.12em] text-accent">FIRST ACTION</p>
      <h2 className="mt-0.5 text-[18px] leading-snug font-bold text-ink">まず、これをしてください</h2>
      <p className="mt-2 text-[14px] leading-relaxed text-ink">{plan.verdict}</p>

      {first && (
        <div className="mt-3 rounded-sm bg-surface px-4 py-3">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <UrgencyBadge urgency={first.urgency} />
            <span className="text-[15px] font-bold text-ink">{first.label}</span>
            <span className="text-[12px] text-muted">{first.categoryLabel}</span>
            {isSite && (
              <span className="text-[12px] text-muted tabular-nums">
                {fmt(first.affectedPages ?? 0)} / {fmt(first.totalPages ?? 0)} ページ
              </span>
            )}
            <span className="ml-auto text-[13px] font-bold text-accent tabular-nums">
              {plan.effectHeading} {first.gainLabel}
            </span>
          </div>
          <Advice>{first.advice ?? "対応方法は「改善提案（詳細）」の該当項目をご覧ください。"}</Advice>
        </div>
      )}

      {plan.total > 0 && (
        <div className="mt-4">
          <SegmentBar
            segments={plan.tiers.map((t) => ({
              label: t.label,
              value: t.count,
              color: palette[URGENCY_TONES[t.urgency]],
            }))}
            ariaLabel="改善点の優先度の内訳"
          />
          <ul className="mt-2 grid gap-x-4 gap-y-1 @md:grid-cols-3">
            {plan.tiers.map((t) => (
              <li key={t.urgency} className="text-[12px] leading-relaxed text-muted">
                <span className="mr-1 inline-flex items-center gap-1 font-bold text-ink">
                  <UrgencyBadge urgency={t.urgency} />
                  <Num>{fmt(t.count)}</Num> 件
                </span>
                <br />
                {t.note}
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-3 text-[11px] text-muted">{note}</p>
    </section>
  );
}
