"use client";

/**
 * Clerk Billing の料金表（決済の実体は Stripe）。
 *
 * ここから購入するとサブスクリプションが作られ、サーバー側の
 * getCurrentPlan() が has({ plan }) で拾って機能が開く。
 *
 * 出すかどうかの判断はサーバー側（src/lib/plans/billing.ts）が持つ。
 * ClerkProvider が無い環境で描画すると例外になるため、条件をここに書き写さない。
 */
import { PricingTable } from "@clerk/nextjs";
import { Card } from "@/components/ui/Card";

export function BillingTable() {
  return (
    <Card
      title="プランのお申し込み・変更"
      description="お支払いはカード決済です。プランはいつでも変更・解約できます。"
      className="mt-6"
    >
      <PricingTable
        // 購入後は料金プランの画面へ戻す（新しいプランがすぐ反映される）
        newSubscriptionRedirectUrl="/plans"
        // Clerk 側のプランのスラッグ。catalog.ts の clerkPlan と同じ（plans.test.ts で固定）
        highlightedPlan="pro"
      />
    </Card>
  );
}
