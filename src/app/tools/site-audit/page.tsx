import type { Metadata } from "next";
import { SiteAuditView } from "@/components/site-audit/SiteAuditView";
import { PlanGate } from "@/components/plans/PlanGate";
import { PageHeader } from "@/components/ui";
import { requireFeature } from "@/lib/features/registry";

const feature = requireFeature("site-audit");

export const metadata: Metadata = { title: feature.label, description: feature.description };

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-6xl @container">
      <PageHeader feature={feature} />
      <PlanGate featureId="site-audit">
        <SiteAuditView />
      </PlanGate>
    </div>
  );
}
