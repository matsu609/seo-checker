/**
 * 3. 判定の内訳（design-spec §3.2-3）／判定の内訳とページ別スコア分布（§3.3-3）。
 */
import { Histogram, Pie, type PieSegment } from "@/components/charts";
import { fmt, type PageReportSummary, type SiteReportSummary } from "@/lib/report";
import { palette } from "@/lib/ui/palette";
import { EmptyLine, Num, ReportSection, SubHeading } from "./report-parts";

function segmentsOf(counts: { pass: number; warn: number; fail: number }): PieSegment[] {
  return [
    { label: "合格", value: counts.pass, color: palette.pass },
    { label: "改善余地", value: counts.warn, color: palette.warn },
    { label: "未対応", value: counts.fail, color: palette.fail },
  ];
}

const MAX_FAILED = 5;

export function PageBreakdownSection({
  summary,
  number,
}: {
  summary: PageReportSummary;
  number: number;
}) {
  const rest = summary.failedLabels.length - MAX_FAILED;
  return (
    <ReportSection
      number={number}
      title="判定の内訳"
      lead="診断項目ごとの判定を集計したものです。参考項目（任意項目）は採点の対象外です。"
    >
      <div className="grid gap-8 @md:grid-cols-2">
        <Pie
          segments={segmentsOf(summary.counts)}
          centerLabel={fmt(summary.counts.scored)}
          centerSub="項目"
          ariaLabel={`判定の内訳: 合格 ${summary.counts.pass} 件、改善余地 ${summary.counts.warn} 件、未対応 ${summary.counts.fail} 件`}
        />
        <div className="min-w-0">
          <SubHeading>未対応の項目</SubHeading>
          {summary.failedLabels.length === 0 ? (
            <EmptyLine>未対応の項目はありません。</EmptyLine>
          ) : (
            <>
              <ul className="space-y-1.5">
                {summary.failedLabels.slice(0, MAX_FAILED).map((label) => (
                  <li key={label} className="flex gap-2 text-[13px] leading-relaxed text-ink">
                    <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-fail" />
                    <span className="min-w-0">{label}</span>
                  </li>
                ))}
              </ul>
              {rest > 0 && (
                <p className="mt-2 text-[12px] text-muted">
                  ほか <Num>{fmt(rest)}</Num> 件（詳細は「改善提案（詳細）」をご覧ください）
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </ReportSection>
  );
}

export function SiteBreakdownSection({
  summary,
  number,
}: {
  summary: SiteReportSummary;
  number: number;
}) {
  return (
    <ReportSection
      number={number}
      title="判定の内訳とページ別スコア分布"
      lead="左は全ページ × 全項目の判定を集計したもの、右はページごとの総合スコアの分布です。"
    >
      <div className="grid gap-8 @md:grid-cols-2">
        <div className="min-w-0">
          <Pie
            segments={segmentsOf(summary.counts)}
            centerLabel={fmt(summary.counts.scored)}
            centerSub="判定"
            ariaLabel={`判定の内訳: 合格 ${summary.counts.pass} 件、改善余地 ${summary.counts.warn} 件、未対応 ${summary.counts.fail} 件`}
          />
          <p className="mt-3 text-[12px] leading-relaxed text-muted">
            {summary.uniformFailCount > 0 ? (
              <>
                全ページ共通で未対応の項目が <Num>{fmt(summary.uniformFailCount)}</Num> 件あります（テンプレートやサイト設定を 1 箇所直せば全ページに効きます）。
              </>
            ) : (
              "全ページ共通で未対応になっている項目はありません。"
            )}
          </p>
        </div>
        <div className="min-w-0">
          <SubHeading>ページ別スコア分布</SubHeading>
          <Histogram
            bands={summary.bands.map((b) => ({
              label: b.grade,
              sublabel: b.range,
              count: b.count,
              color: b.color,
            }))}
            marker={{ fraction: summary.averageFraction, label: `平均 ${summary.average} 点` }}
            ariaLabel={`ページ別スコア分布: ${summary.bands.map((b) => `${b.grade}（${b.range}）${b.count}ページ`).join("、")}`}
          />
          <p className="mt-2 text-[12px] leading-relaxed text-muted">
            最も多い区分は {summary.modeBand.grade}（{summary.modeBand.label}）: <Num>{fmt(summary.modeBand.count)}</Num> ページ。平均{" "}
            <Num>{summary.average}</Num> 点 / 中央値 <Num>{summary.median}</Num> 点。
          </p>
        </div>
      </div>
    </ReportSection>
  );
}
