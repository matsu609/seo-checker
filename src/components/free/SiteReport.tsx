/**
 * SITE モード（サイト全体）のレポート本体（design-spec §3.3）。
 *
 * クイック診断なので対象は代表ページだけ（src/lib/free/limits.ts）。見つかったページ数より
 * 少ないときは、表紙に「全 N ページ中」を出して、残りは精密診断であることを伝える。
 */
import { useMemo } from "react";
import type { SiteAnalysisResult } from "@/lib/analyzer/types";
import { buildSiteSummary, fmt, formatDuration, hostOf } from "@/lib/report";
import { SiteAppendix } from "./Appendix";
import { SiteBreakdownSection } from "./BreakdownSection";
import { CategorySection } from "./CategorySection";
import { SiteDetailSection } from "./DetailSection";
import { HeatTableSection } from "./HeatTable";
import { MethodAppendix, NextSteps, ReportFooter } from "./MethodAppendix";
import { OverallSection } from "./OverallSection";
import { ReportCover } from "./ReportCover";
import { ReportSheet } from "./ReportSheet";
import { DISCOVERY_LABEL } from "./report-parts";

const VERSION = process.env.NEXT_PUBLIC_APP_VERSION || "0.1.0";

export function SiteReport({ result, elapsedMs }: { result: SiteAnalysisResult; elapsedMs: number }) {
  const summary = useMemo(() => buildSiteSummary(result), [result]);
  const entry = summary.rankedPages.find((p) => p.isEntry);
  const entryPage = result.pages.find((p) => p.url === entry?.url) ?? result.pages[0];
  const failed = result.failures.length;
  const excluded = summary.excludedPages.length;
  const discovered = result.crawl?.discovered ?? result.pages.length;
  const rest = Math.max(0, discovered - result.pages.length);
  const pagesLabel = `${fmt(result.pages.length)} ページ${rest > 0 ? `（見つかった ${fmt(discovered)} ページ中の代表）` : ""}（${DISCOVERY_LABEL[result.discovery]}${
    excluded > 0 ? `・採点対象外 ${fmt(excluded)} 件` : ""
  }${failed > 0 ? `・取得失敗 ${fmt(failed)} 件` : ""}）`;

  return (
    <>
      <ReportCover
        host={hostOf(result.entryUrl)}
        pageTitle={entryPage?.page.title ?? null}
        url={result.entryUrl}
        fetchedAt={result.fetchedAt}
        scopeLabel={rest > 0 ? "サイト全体（代表ページ）" : "サイト全体（全ページ）"}
        pagesLabel={pagesLabel}
        durationLabel={formatDuration(result.crawl?.durationMs ?? elapsedMs)}
        grade={summary.grade}
      />
      <ReportSheet>
        <OverallSection summary={summary} number={1} />
        <CategorySection summary={summary} number={2} />
        <SiteBreakdownSection summary={summary} number={3} />
        <HeatTableSection summary={summary} number={4} />
        <SiteDetailSection summary={summary} number={5} />
        <SiteAppendix result={result} summary={summary} number="付録 A" />
        <MethodAppendix number="付録 B" fetchedAt={result.fetchedAt} version={VERSION} />
        <NextSteps />
        <ReportFooter />
      </ReportSheet>
    </>
  );
}
