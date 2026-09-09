import type { Metadata } from "next";
import { KeywordsTool } from "@/components/keywords/KeywordsTool";
import { PlanGate } from "@/components/plans/PlanGate";
import { PageHeader } from "@/components/ui";
import { requireFeature } from "@/lib/features/registry";

const feature = requireFeature("keywords");

export const metadata: Metadata = { title: feature.label, description: feature.description };

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-6xl @container">
      <PageHeader feature={feature} />
      <PlanGate featureId="keywords">
        <KeywordsTool />
      </PlanGate>
    </div>
  );
}
