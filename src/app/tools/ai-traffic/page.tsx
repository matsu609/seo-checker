import type { Metadata } from "next";
import { AiTrafficView } from "@/components/ai-traffic/AiTrafficView";
import { PlanGate } from "@/components/plans/PlanGate";
import { PageHeader } from "@/components/ui";
import { requireFeature } from "@/lib/features/registry";

const feature = requireFeature("ai-traffic");

export const metadata: Metadata = { title: feature.label, description: feature.description };

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-6xl @container">
      <PageHeader feature={feature} />
      <PlanGate featureId="ai-traffic">
        <AiTrafficView />
      </PlanGate>
    </div>
  );
}
