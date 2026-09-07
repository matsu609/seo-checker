import type { Metadata } from "next";
import { AioTopicsTool } from "@/components/aio-topics/AioTopicsTool";
import { PageHeader } from "@/components/ui";
import { requireFeature } from "@/lib/features/registry";

const feature = requireFeature("aio-topics");

export const metadata: Metadata = { title: feature.label, description: feature.description };

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-6xl @container">
      <PageHeader feature={feature} />
      <AioTopicsTool />
    </div>
  );
}
