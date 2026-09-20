import type { Metadata } from "next";
import { Suspense } from "react";
import { ReportsTool } from "@/components/reports/ReportsTool";
import { PlanGate } from "@/components/plans/PlanGate";
import { PageHeader } from "@/components/ui";
import { requireFeature } from "@/lib/features/registry";

const feature = requireFeature("reports");

export const metadata: Metadata = { title: feature.label, description: feature.description };

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-6xl @container">
      <PageHeader feature={feature} />
      <PlanGate featureId="reports">
        {/* ReportsTool は ?month= を useSearchParams で読むので、静的な描画のために Suspense で包む */}
        <Suspense fallback={null}>
          <ReportsTool />
        </Suspense>
      </PlanGate>
    </div>
  );
}
