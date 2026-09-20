import type { Metadata } from "next";
import { NapTool } from "@/components/nap/NapTool";
import { PlanGate } from "@/components/plans/PlanGate";
import { PageHeader } from "@/components/ui";
import { requireFeature } from "@/lib/features/registry";

/**
 * NAP チェック（表記ゆれの検出）。利用者の決定 2026-09-20:
 * 「網羅的な登録チェックは原理的に完成しない。登録されている内容がずれていないかを主機能にする。
 *  一致か不一致しかないのでごまかしが効かない」。入力は 4 つ（店名・住所・電話・サイト URL）だけ。
 */
const feature = requireFeature("nap");

export const metadata: Metadata = { title: feature.label, description: feature.description };

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-6xl @container">
      <PageHeader feature={feature} />
      <PlanGate featureId="nap">
        <NapTool />
      </PlanGate>
    </div>
  );
}
