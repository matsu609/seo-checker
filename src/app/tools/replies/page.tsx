import type { Metadata } from "next";
import { PlanGate } from "@/components/plans/PlanGate";
import { RepliesTool } from "@/components/replies/RepliesTool";
import { PageHeader } from "@/components/ui";
import { requireFeature } from "@/lib/features/registry";

const feature = requireFeature("replies");

export const metadata: Metadata = { title: feature.label, description: feature.description };

// Google 連携の状態はログイン中のユーザーごとに変わるので、ビルド時に固めない
export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-6xl @container">
      <PageHeader feature={feature} />
      <PlanGate featureId="replies">
        <RepliesTool />
      </PlanGate>
    </div>
  );
}
