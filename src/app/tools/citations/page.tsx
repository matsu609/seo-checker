import type { Metadata } from "next";
import { CitationsTool } from "@/components/citations/CitationsTool";
import { ListingsTool } from "@/components/listings/ListingsTool";
import { PlanGate } from "@/components/plans/PlanGate";
import { PageHeader, TabPanels } from "@/components/ui";
import { requireFeature } from "@/lib/features/registry";

/**
 * 掲載（利用者の決定 2026-09-19）。
 * 旧「サイテーション（掲載・言及チェック）」と旧「基本情報掲載（NAP 一括登録）」を
 * 1 画面 2 タブにまとめた。「どこに載っているか調べる → 載っていない先に登録する」が
 * 一続きの作業で、もともと片方からもう片方へ送っていたため。
 * プランの線は変えない（調べる = ライト、登録する = スタンダード）ので、タブごとに旧 ID でゲートする。
 */
const feature = requireFeature("citations");

export const metadata: Metadata = { title: feature.label, description: feature.description };

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-6xl @container">
      <PageHeader feature={feature} />
      <TabPanels
        ariaLabel="掲載の表示切り替え"
        tabs={[
          { id: "check", label: "どこに載っているか調べる" },
          { id: "register", label: "掲載先に登録する" },
        ]}
        panels={{
          check: (
            <PlanGate featureId="citations">
              <CitationsTool />
            </PlanGate>
          ),
          register: (
            <PlanGate featureId="listings">
              <ListingsTool />
            </PlanGate>
          ),
        }}
      />
    </div>
  );
}
