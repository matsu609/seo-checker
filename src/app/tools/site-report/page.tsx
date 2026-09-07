import type { Metadata } from "next";
import { SiteReportView } from "@/components/site-report/SiteReportView";
import { PageHeader } from "@/components/ui";
import { requireFeature } from "@/lib/features/registry";

const feature = requireFeature("site-report");

export const metadata: Metadata = { title: feature.label, description: feature.description };

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-6xl @container">
      <PageHeader feature={feature} />
      <SiteReportView />
    </div>
  );
}
