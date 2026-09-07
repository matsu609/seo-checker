import type { Metadata } from "next";
import { PromptExpansionTool } from "@/components/prompt-expansion/PromptExpansionTool";
import { PageHeader } from "@/components/ui";
import { requireFeature } from "@/lib/features/registry";

const feature = requireFeature("prompt-expansion");

export const metadata: Metadata = { title: feature.label, description: feature.description };

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-6xl @container">
      <PageHeader feature={feature} />
      <PromptExpansionTool />
    </div>
  );
}
