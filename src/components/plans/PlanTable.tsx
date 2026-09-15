/**
 * 料金プランの比較（サーバーコンポーネント）。
 *
 * 3 つを高い順に並べる。いちばん高い段を先に見せて基準にし（アンカリング）、
 * 真ん中の本命を強調する（極端回避性・松竹梅）。並び順と本命の指定は
 * src/lib/plans/catalog.ts が持つ（LISTED_PLANS は高い順、recommended が本命）。
 *
 * 現在のプランを強調し、各プランにどのツールが含まれるかをレジストリから引く。
 */
import { Badge, Card } from "@/components/ui";
import { ButtonLink } from "@/components/ui/Button";
import { FEATURE_GROUPS } from "@/lib/features/registry";
import { OPERATOR } from "@/lib/legal/operator";
import { LISTED_PLANS, planAllows, planPriceLabel, type PlanId } from "@/lib/plans/catalog";
import { PlanCheckoutButton } from "./PlanCheckoutButton";

/** そのプランで使えるツール名（クイック診断と設定は除く）。上位プランは下位の機能も含む */
function toolsFor(plan: PlanId): string[] {
  return FEATURE_GROUPS.filter((g) => g.id !== "free" && g.id !== "settings")
    .flatMap((g) => g.features)
    .filter((f) => f.plan !== "free" && planAllows(plan, f.plan))
    .map((f) => f.shortLabel);
}

export interface PlanTableProps {
  current: PlanId;
  /** 画面から申し込めるプラン（Stripe の設定がそろっているもの）。空なら申し込みボタンを出さない */
  purchasable?: readonly PlanId[];
}

export function PlanTable({ current, purchasable = [] }: PlanTableProps) {
  return (
    <div className="grid gap-4 @3xl:grid-cols-3">
      {LISTED_PLANS.map((plan) => {
        const included = planAllows(current, plan.id);
        const isCurrent = current === plan.id;
        const tools = toolsFor(plan.id);
        const canBuy = plan.checkout === "stripe" && purchasable.includes(plan.id) && !isCurrent;
        return (
          <Card
            key={plan.id}
            as="article"
            className={`flex flex-col ${plan.recommended ? "border-accent ring-1 ring-accent/40" : ""} ${isCurrent ? "border-accent" : ""}`}
            title={
              <span className="flex flex-wrap items-center gap-2">
                {plan.label}
                {plan.recommended && !isCurrent && (
                  <Badge tone="info" icon={false}>
                    いちばん選ばれています
                  </Badge>
                )}
                {isCurrent && (
                  <Badge tone="pass" icon={false}>
                    現在のプラン
                  </Badge>
                )}
                {!isCurrent && included && (
                  <Badge tone="info" icon={false}>
                    利用できます
                  </Badge>
                )}
              </span>
            }
          >
            <p className="text-[22px] font-bold text-ink tabular-nums">{planPriceLabel(plan.id)}</p>
            {plan.limitNote && <p className="mt-1 text-[12px] font-bold text-accent">{plan.limitNote}</p>}
            <p className="mt-1 text-[13px] leading-relaxed text-muted">{plan.summary}</p>
            <ul className="mt-3 space-y-1.5 text-[13px] leading-relaxed text-ink">
              {plan.highlights.map((h) => (
                <li key={h} className="flex gap-1.5">
                  <span aria-hidden className={included ? "text-pass" : "text-muted"}>
                    ✓
                  </span>
                  <span className="min-w-0">{h}</span>
                </li>
              ))}
            </ul>
            {tools.length > 0 && (
              <p className="mt-3 text-[12px] leading-relaxed text-muted">
                このプランで開放されるツール: {tools.join("、")}
              </p>
            )}
            <div className="mt-auto pt-4">
              {canBuy && (
                <PlanCheckoutButton
                  plan={plan.id}
                  label={`${plan.label}を申し込む`}
                  variant={plan.recommended ? "primary" : "secondary"}
                />
              )}
              {plan.checkout === "contact" && OPERATOR.email && (
                <ButtonLink
                  href={`mailto:${OPERATOR.email}?subject=${encodeURIComponent(`${plan.label}のお問い合わせ`)}`}
                  variant="secondary"
                  size="lg"
                  className="w-full"
                >
                  お問い合わせ（空き枠の確認）
                </ButtonLink>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
