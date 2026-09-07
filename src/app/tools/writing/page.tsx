import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { WritingTool } from "@/components/writing/WritingTool";
import { requireFeature } from "@/lib/features/registry";

const feature = requireFeature("writing");

export const metadata: Metadata = { title: feature.label, description: feature.description };

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-6xl @container">
      <PageHeader feature={feature} />
      <WritingTool />
    </div>
  );
}
