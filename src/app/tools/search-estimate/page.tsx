import type { Metadata } from "next";
import { PlanGate } from "@/components/plans/PlanGate";
import { SearchEstimateTool } from "@/components/search-estimate/SearchEstimateTool";
import { PageHeader } from "@/components/ui";
import { requireFeature } from "@/lib/features/registry";

const feature = requireFeature("search-estimate");

export const metadata: Metadata = { title: feature.label, description: feature.description };

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-6xl @container">
      <PageHeader feature={feature} />
      <PlanGate featureId="search-estimate">
        <SearchEstimateTool />
      </PlanGate>
    </div>
  );
}
