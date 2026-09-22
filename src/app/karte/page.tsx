import type { Metadata } from "next";
import { PlanGate } from "@/components/plans/PlanGate";
import { PageHeader } from "@/components/ui";
import { requireFeature } from "@/lib/features/registry";
import { KarteView } from "./KarteView";

/**
 * お客様カルテ（利用者の決定 2026-09-21）。
 *
 * 個人開発の差別化は機能の数ではなく「お客様のことを分かっていること」で作る、という判断から。
 * ここで集めた答えは ①AI の文章（改修案・FAQ 案・口コミ返信・MEO 総評）に自動で入り、
 * ②ご要望の欄は運営者の集計画面（/admin/karte）に集まって次の機能開発の材料になる。
 */
const feature = requireFeature("karte");

export const metadata: Metadata = { title: feature.shortLabel, description: feature.description };

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-4xl @container">
      <PageHeader feature={feature} />
      <PlanGate featureId="karte">
        <KarteView />
      </PlanGate>
    </div>
  );
}
