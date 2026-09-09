/**
 * 料金プランの比較（サーバーコンポーネント）。
 * 現在のプランを強調し、各プランにどのツールが含まれるかをレジストリから引く。
 */
import { Badge, Card } from "@/components/ui";
import { FEATURE_GROUPS } from "@/lib/features/registry";
import { PLANS, planAllows, planPriceLabel, type PlanId } from "@/lib/plans/catalog";

/** そのプランで使えるツール名（無料診断と設定は除く） */
function toolsFor(plan: PlanId): string[] {
  return FEATURE_GROUPS.filter((g) => g.id !== "free" && g.id !== "settings")
    .flatMap((g) => g.features)
    .filter((f) => f.plan === plan)
    .map((f) => f.shortLabel);
}

export function PlanTable({ current }: { current: PlanId }) {
  return (
    <div className="grid gap-4 @xl:grid-cols-3">
      {PLANS.map((plan) => {
        const included = planAllows(current, plan.id);
        const isCurrent = current === plan.id;
        const tools = toolsFor(plan.id);
        return (
          <Card
            key={plan.id}
            as="article"
            title={
              <span className="flex flex-wrap items-center gap-2">
                {plan.label}
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
            className={isCurrent ? "border-accent" : undefined}
          >
            <p className="text-[22px] font-bold text-ink tabular-nums">{planPriceLabel(plan.id)}</p>
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
          </Card>
        );
      })}
    </div>
  );
}
