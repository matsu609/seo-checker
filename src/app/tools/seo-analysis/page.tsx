import type { Metadata } from "next";
import { PlanGate } from "@/components/plans/PlanGate";
import { SeoAnalysisView } from "@/components/seo-analysis/SeoAnalysisView";
import { PageHeader } from "@/components/ui";
import { requireFeature } from "@/lib/features/registry";

const feature = requireFeature("seo-analysis");

export const metadata: Metadata = { title: feature.label, description: feature.description };

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-6xl @container">
      <PageHeader feature={feature} />
      <PlanGate featureId="seo-analysis">
        <SeoAnalysisView />
      </PlanGate>
    </div>
  );
}
