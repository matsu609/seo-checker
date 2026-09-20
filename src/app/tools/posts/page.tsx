import type { Metadata } from "next";
import { PostsTool } from "@/components/posts/PostsTool";
import { PlanGate } from "@/components/plans/PlanGate";
import { PageHeader } from "@/components/ui";
import { requireFeature } from "@/lib/features/registry";

const feature = requireFeature("posts");

export const metadata: Metadata = { title: feature.label, description: feature.description };

/** Google 連携の状態を毎回見るので静的にしない（口コミの画面と同じ） */
export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-6xl @container">
      <PageHeader feature={feature} />
      <PlanGate featureId="posts">
        <PostsTool />
      </PlanGate>
    </div>
  );
}
