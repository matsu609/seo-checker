import type { Metadata } from "next";
import { ImprovementView } from "@/components/improvement/ImprovementView";
import { PlanGate } from "@/components/plans/PlanGate";
import { PageHeader } from "@/components/ui";
import { requireFeature } from "@/lib/features/registry";

const feature = requireFeature("improvement");

export const metadata: Metadata = { title: feature.label, description: feature.description };

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-5xl @container">
      <PageHeader feature={feature} />
      <PlanGate featureId="improvement">
        <ImprovementView />
      </PlanGate>
    </div>
  );
}
