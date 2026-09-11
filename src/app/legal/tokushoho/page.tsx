import type { Metadata } from "next";
import { Tokushoho } from "@/components/legal/Tokushoho";
import { PageHeader } from "@/components/ui";
import { SERVICE_NAME } from "@/lib/legal/operator";

export const metadata: Metadata = {
  title: "特定商取引法に基づく表記",
  description: `${SERVICE_NAME} の有料プランに関する、特定商取引法に基づく表記（販売事業者・価格・支払方法・解約と返金）です。`,
};

/**
 * 特定商取引法に基づく表記。申し込み前に読めるよう、ログイン不要（src/lib/auth/routes.ts の PUBLIC_PAGES）。
 * Stripe のアカウント審査でもこの URL を提示する。
 */
export default function Page() {
  return (
    <div className="mx-auto w-full max-w-5xl @container">
      <PageHeader title="特定商取引法に基づく表記" description={`${SERVICE_NAME} の有料プラン（カード決済）に関する表示です。`} />
      <Tokushoho />
    </div>
  );
}
