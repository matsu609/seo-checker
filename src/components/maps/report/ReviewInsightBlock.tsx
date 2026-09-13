/**
 * 口コミの傾向（精密診断のみ）。表示だけ。
 *
 * Google が 1 回で返す口コミは最新 5 件まで。毎週保存した分をまとめているので、
 * 続けるほど件数が増える。「どの言葉で褒められ、何に不満が出ているか」を出す。
 */
import { EmptyLine, Num, SubHeading } from "@/components/free/report-parts";
import { HBar } from "@/components/charts";
import type { ReviewInsights } from "@/lib/maps/review-insights";

function day(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : `${d.getFullYear()}年${d.getMonth() + 1}月`;
}

export function ReviewInsightBlock({ insights, reports }: { insights: ReviewInsights; reports: number }) {
  if (insights.withText === 0) {
    return (
      <>
        <SubHeading className="mt-6">口コミの傾向</SubHeading>
        <EmptyLine>本文のある口コミがまだ集まっていません。毎週の更新で少しずつ貯まります。</EmptyLine>
      </>
    );
  }

  return (
    <>
      <SubHeading className="mt-6" note={`${reports} 回分の診断から集計`}>
        口コミの傾向
      </SubHeading>
      <p className="mt-1 text-[13px] leading-relaxed text-muted">
        重複を除いて <Num>{insights.total}</Num> 件（本文つき <Num>{insights.withText}</Num> 件、{day(insights.since)}〜{day(insights.until)}）。
        Google は 1 回に最新 5 件までしか返さないため、毎週の記録を重ねるほど厚くなります。
      </p>

      {insights.topics.length > 0 && (
        <div className="mt-3">
          <HBar
            rows={insights.topics.map((t) => ({
              label: t.word,
              value: t.count,
              valueLabel: (
                <span className="text-[12px] font-normal whitespace-nowrap tabular-nums">
                  {t.count}件{t.averageRating !== null ? ` ★${t.averageRating.toFixed(1)}` : ""}
                </span>
              ),
            }))}
            max={Math.max(1, insights.topics[0]?.count ?? 1)}
            ticks={[]}
            valueTone="none"
            legend={false}
            labelWidth="7rem"
            ariaLabel="口コミによく出てくる言葉"
          />
          <p className="mt-1 text-[11px] text-muted">※ その語を含む口コミの件数と、その口コミの平均評価です。</p>
        </div>
      )}

      <div className="mt-4 grid gap-4 @md:grid-cols-2">
        <div>
          <p className="text-[13px] font-bold text-ink">褒められている点</p>
          {insights.positives.length === 0 ? (
            <p className="mt-1 text-[13px] text-muted">目立った褒め言葉はまだ出ていません。</p>
          ) : (
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {insights.positives.map((p) => (
                <li key={p.word} className="rounded-sm border border-pass/40 bg-pass-soft px-2 py-0.5 text-[12px] text-ink">
                  {p.word} <span className="tabular-nums text-muted">{p.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="text-[13px] font-bold text-ink">不満のサイン</p>
          {insights.negatives.length === 0 ? (
            <p className="mt-1 text-[13px] text-muted">不満を示す言葉は見つかりませんでした。</p>
          ) : (
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {insights.negatives.map((n) => (
                <li key={n.word} className="rounded-sm border border-fail/40 bg-fail-soft px-2 py-0.5 text-[12px] text-ink">
                  {n.word} <span className="tabular-nums text-muted">{n.count}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {insights.lowSamples.length > 0 && (
        <div className="mt-4">
          <p className="text-[13px] font-bold text-ink">低評価（★1〜2）の内容</p>
          <ul className="mt-1 divide-y divide-line border-y border-line">
            {insights.lowSamples.map((s, i) => (
              <li key={`${s.publishedAt ?? ""}-${i}`} className="py-2 text-[13px] leading-relaxed text-ink">
                <span className="mr-2 font-bold tabular-nums">★ {s.rating?.toFixed(1) ?? "—"}</span>
                {s.text}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[11px] text-muted">※ ここに出た指摘は、返信と改善の両方で対応してください。</p>
        </div>
      )}
    </>
  );
}
