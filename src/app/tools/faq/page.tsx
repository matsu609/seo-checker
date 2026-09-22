import type { Metadata } from "next";
import { FaqTool } from "@/components/faq/FaqTool";
import { PlanGate } from "@/components/plans/PlanGate";
import { PageHeader } from "@/components/ui";
import { requireFeature } from "@/lib/features/registry";

/**
 * FAQ 提案（利用者の指示 2026-09-22「AI に読み取りやすくさせるために必要な、
 * HP に入れるべき FAQ の提案機能を SEO に入れる」）。
 *
 * 出すのは①いまの状態（事実）と②入れるべき FAQ（改善案）、③そのまま貼れる形まで。
 * ホームページへの反映はしない（SEO・AIO は提示まで、という線引き）。
 */
const feature = requireFeature("faq");

export const metadata: Metadata = { title: feature.label, description: feature.description };

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-5xl @container">
      <PageHeader feature={feature} />
      <PlanGate featureId="faq">
        <FaqTool />
      </PlanGate>
    </div>
  );
}
