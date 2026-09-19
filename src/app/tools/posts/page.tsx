import type { Metadata } from "next";
import { PlanGate } from "@/components/plans/PlanGate";
import { PostsTool } from "@/components/posts/PostsTool";
import { PageHeader } from "@/components/ui";
import { requireFeature } from "@/lib/features/registry";

/**
 * ビジネス プロフィールへの投稿（2026-09-19）。
 * MEO の診断が採点している「投稿」の打ち手。口コミ返信と同じ business.manage スコープで送る。
 */
const feature = requireFeature("posts");

export const metadata: Metadata = { title: feature.label, description: feature.description };

// Google 連携の状態はログイン中のユーザーごとに変わるので、ビルド時に固めない
export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-4xl @container">
      <PageHeader feature={feature} />
      <PlanGate featureId="posts">
        <PostsTool />
      </PlanGate>
    </div>
  );
}
