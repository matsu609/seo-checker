/**
 * 料金プランによる画面のゲート（サーバーコンポーネント）。
 *
 * プランが足りていれば中身をそのまま出し、足りなければ案内に差し替える。
 * ページ見出し（PageHeader）は外側に残す前提で、ツール本体だけを包む。
 */
import Link from "next/link";
import { Callout } from "@/components/ui/Callout";
import { planLabel, planPriceLabel } from "@/lib/plans/catalog";
import { checkPlanForFeature } from "@/lib/plans/guard";

export async function PlanGate({
  featureId,
  children,
}: {
  featureId: string;
  children: React.ReactNode;
}) {
  const denial = await checkPlanForFeature(featureId);
  if (!denial) return <>{children}</>;

  return (
    <Callout tone="info" title={`「${planLabel(denial.required)}」プランの機能です`}>
      <p>
        この機能は{planLabel(denial.required)}（{planPriceLabel(denial.required)}
        ）以上でご利用いただけます。現在のプランは「{planLabel(denial.current)}」です。
      </p>
      <p className="mt-2">
        <Link href="/plans" className="text-accent underline">
          プランの内容を見る
        </Link>
      </p>
    </Callout>
  );
}
