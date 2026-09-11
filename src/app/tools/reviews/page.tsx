import type { Metadata } from "next";
import { PlanGate } from "@/components/plans/PlanGate";
import { ReviewsTool } from "@/components/reviews/ReviewsTool";
import { PageHeader } from "@/components/ui";
import { requireFeature } from "@/lib/features/registry";

const feature = requireFeature("reviews");

export const metadata: Metadata = { title: feature.label, description: feature.description };

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-6xl @container">
      <PageHeader feature={feature} />
      <PlanGate featureId="reviews">
        <ReviewsTool />
      </PlanGate>
    </div>
  );
}
