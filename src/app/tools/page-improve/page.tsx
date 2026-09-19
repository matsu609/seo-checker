import type { Metadata } from "next";
import { ImprovementView } from "@/components/improvement/ImprovementView";
import { PageDiagnosisTool } from "@/components/page-diagnosis/PageDiagnosisTool";
import { PlanGate } from "@/components/plans/PlanGate";
import { PageHeader, TabPanels } from "@/components/ui";
import { requireFeature } from "@/lib/features/registry";

/**
 * ページ改善（利用者の決定 2026-09-19）。
 * 旧「ページ診断（競合比較）」と旧「HP 改修提案」を 1 画面 2 タブにまとめた。
 * 同じ「1 ページをよくする」仕事なのにタブが分かれていて、使い分けが分からなかったため。
 * プランの線は旧機能のまま（競合比較 = ライト、改修案 = スタンダード）なので、
 * タブごとに旧 ID で PlanGate を通す。
 */
const feature = requireFeature("page-improve");

export const metadata: Metadata = { title: feature.label, description: feature.description };

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-6xl @container">
      <PageHeader feature={feature} />
      <TabPanels
        ariaLabel="ページ改善の表示切り替え"
        tabs={[
          { id: "compare", label: "競合と比べる" },
          { id: "rewrite", label: "改修案を作る" },
        ]}
        panels={{
          compare: (
            <PlanGate featureId="page-diagnosis">
              <PageDiagnosisTool />
            </PlanGate>
          ),
          rewrite: (
            <PlanGate featureId="improvement">
              <ImprovementView />
            </PlanGate>
          ),
        }}
      />
    </div>
  );
}
