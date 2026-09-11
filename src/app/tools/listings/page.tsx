import type { Metadata } from "next";
import { ListingsTool } from "@/components/listings/ListingsTool";
import { PlanGate } from "@/components/plans/PlanGate";
import { PageHeader } from "@/components/ui";
import { requireFeature } from "@/lib/features/registry";

const feature = requireFeature("listings");

export const metadata: Metadata = { title: feature.label, description: feature.description };

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-6xl @container">
      <PageHeader feature={feature} />
      <PlanGate featureId="listings">
        <ListingsTool />
      </PlanGate>
    </div>
  );
}
