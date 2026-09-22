import type { Metadata } from "next";
import { PageImproveTool } from "@/components/page-improve/PageImproveTool";
import { PlanGate } from "@/components/plans/PlanGate";
import { PageHeader } from "@/components/ui";
import { requireFeature } from "@/lib/features/registry";

/**
 * ページ改善。**1 回の操作で「競合と比べた事実」と「改善案」を同じページに出す**
 * （利用者の指示 2026-09-22「競合と比べたら改善案はそのページで提示すればよくない？」）。
 *
 * 2026-09-19 にタブ 2 枚（競合と比べる / 改修案を作る）にまとめたが、
 * **タブが分かれているうえ、改修案が競合の情報を見ていなかった**ので、
 * 2026-09-22 に 1 本の流れへ統合した。
 *
 * プランの線引きは変えない: 比較（事実）= ライト、改善案 = スタンダード。
 * 入口はライトで開け、改善案の API が 402 を返したら画面が案内に差し替える。
 */
const feature = requireFeature("page-improve");

export const metadata: Metadata = { title: feature.label, description: feature.description };

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-6xl @container">
      <PageHeader feature={feature} />
      <PlanGate featureId="page-diagnosis">
        <PageImproveTool />
      </PlanGate>
    </div>
  );
}
