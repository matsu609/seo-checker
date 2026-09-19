import type { Metadata } from "next";
import { PlanGate } from "@/components/plans/PlanGate";
import { RepliesTool } from "@/components/replies/RepliesTool";
import { ReviewsTool } from "@/components/reviews/ReviewsTool";
import { PageHeader, TabPanels } from "@/components/ui";
import { requireFeature } from "@/lib/features/registry";

/**
 * 口コミ（利用者の決定 2026-09-19）。
 * 旧「口コミ支援（アンケート QR）」と旧「口コミへの返信」を 1 画面 2 タブにまとめた。
 * 対象（Google マップの口コミ）も日々の運用も同じで、集めた口コミにそのまま返信するため。
 * どちらもスタンダードなので、ゲートは画面に 1 つでよい。
 */
const feature = requireFeature("reviews");

export const metadata: Metadata = { title: feature.label, description: feature.description };

// Google 連携の状態はログイン中のユーザーごとに変わるので、ビルド時に固めない（返信タブ）
export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-6xl @container">
      <PageHeader feature={feature} />
      <PlanGate featureId="reviews">
        <TabPanels
          ariaLabel="口コミの表示切り替え"
          tabs={[
            { id: "collect", label: "集める（アンケート QR）" },
            { id: "reply", label: "返す（返信案）" },
          ]}
          panels={{
            collect: <ReviewsTool />,
            reply: (
              <PlanGate featureId="replies">
                <RepliesTool />
              </PlanGate>
            ),
          }}
        />
      </PlanGate>
    </div>
  );
}
