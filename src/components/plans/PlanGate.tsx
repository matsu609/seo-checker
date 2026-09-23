/**
 * 料金プランによる画面のゲート（サーバーコンポーネント）。
 *
 * プランが足りていれば中身をそのまま出し、足りなければ案内に差し替える。
 * ページ見出し（PageHeader）は外側に残す前提で、ツール本体だけを包む。
 */
import Link from "next/link";
import { Callout } from "@/components/ui/Callout";
import { planLabel, planPriceLabel, upgradeTarget } from "@/lib/plans/catalog";
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

  // 管理アカウント（2026-09-23 からサーバーでも止める）。ふだんは AppShell が ManagerNotice に差し替えるので、
  // ここに来るのは判定が取れる前の一瞬か、差し替えの外にある画面だけ。プランの案内は出さない（買えば使える話ではない）
  if (denial.reason === "manager") {
    return (
      <Callout tone="info" title="この画面は管理アカウントでは使いません">
        <p>{denial.message}</p>
        <p className="mt-2">
          <Link href="/clients" className="text-accent underline">
            顧客管理へ
          </Link>
        </p>
      </Callout>
    );
  }

  return (
    <Callout tone="info" title={`「${upgradeTarget(denial.required).label}」プランの機能です`}>
      <p>
        この機能は{upgradeTarget(denial.required).label}（{planPriceLabel(upgradeTarget(denial.required).id)}
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
