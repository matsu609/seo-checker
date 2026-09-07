/**
 * PAGE モードのレポート本体（design-spec §3.2）。
 * 表紙帯 + 1 枚の白いシートの中に、番号付きセクションを並べる。
 */
import { useMemo } from "react";
import type { AnalysisResult } from "@/lib/analyzer/types";
import { buildPageSummary, formatDuration, hostOf } from "@/lib/report";
import { PageAppendix } from "./Appendix";
import { PageBreakdownSection } from "./BreakdownSection";
import { CategorySection } from "./CategorySection";
import { PageDetailSection } from "./DetailSection";
import { FaqSection } from "./FaqSection";
import { MethodAppendix, NextSteps, ReportFooter } from "./MethodAppendix";
import { OverallSection } from "./OverallSection";
import { ReportCover } from "./ReportCover";
import { ReportSheet } from "./ReportSheet";

const VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "0.1.0";

export function PageReport({
  result,
  faqEnabled,
  elapsedMs,
}: {
  result: AnalysisResult;
  faqEnabled: boolean;
  elapsedMs: number;
}) {
  const summary = useMemo(() => buildPageSummary(result), [result]);
  return (
    <>
      <ReportCover
        host={hostOf(result.page.finalUrl)}
        pageTitle={result.page.title}
        url={result.page.finalUrl}
        fetchedAt={result.page.fetchedAt}
        scopeLabel="このページ"
        pagesLabel="1 ページ"
        durationLabel={formatDuration(elapsedMs)}
        grade={summary.grade}
      />
      <ReportSheet>
        <OverallSection summary={summary} number={1} />
        <CategorySection summary={summary} number={2} />
        <PageBreakdownSection summary={summary} number={3} />
        <PageDetailSection result={result} number={4} />
        <FaqSection key={result.page.finalUrl} result={result} enabled={faqEnabled} number={5} />
        <PageAppendix result={result} number="付録 A" />
        <MethodAppendix number="付録 B" fetchedAt={result.page.fetchedAt} version={VERSION} />
        <NextSteps />
        <ReportFooter />
      </ReportSheet>
    </>
  );
}
