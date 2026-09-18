/**
 * 代理店画面の登録者一覧。
 *
 * マスター画面の顧客一覧と同じ情報を出す。触れるのは「割引」だけ（利用者の決定 2026-09-18。
 * 代理店が担当の登録者に割引を設定できるようにする）。機能の個別開放と担当の付け替えは
 * 運用者（マスター）だけの操作なので、ここには出さない。押せないボタンを並べると
 * 「頼めばできる」に見えてしまうため、表示そのものを持たせない。
 */
import { Callout } from "@/components/ui/Callout";
import { Card } from "@/components/ui/Card";
import { planLabel } from "@/lib/plans/catalog";
import type { ClientRow } from "@/lib/admin/clients";
import { formatDate, planSourceLabel, STATUS_TONE } from "@/components/admin/format";
import { PromoSelect } from "@/components/admin/PromoSelect";

export function ClientCards({ rows }: { rows: ClientRow[] }) {
  if (rows.length === 0) {
    return (
      <Callout tone="info" title="担当の登録者がまだいません">
        お客様が登録したあと、運用者が担当としてお客様をこの画面に割り当てます。
        お心当たりのあるお客様が出てこない場合は、運用者にお知らせください。
      </Callout>
    );
  }

  return (
    <div className="space-y-4">
      {rows.map((row) => (
        <Card key={row.userId} title={row.email || row.name || row.userId} description={row.name || undefined}>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 @lg:grid-cols-4">
            <div>
              <dt className="text-[11px] text-muted">契約状況</dt>
              <dd className="mt-1">
                <span
                  className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-bold leading-4 ${STATUS_TONE[row.billing.status]}`}
                >
                  {row.billing.statusLabel}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted">月額</dt>
              <dd className="mt-1 text-[15px] font-bold text-ink tabular-nums">
                {row.billing.monthly ? row.billing.monthly.label : "—"}
                {row.billing.coupon &&
                  row.billing.subtotal &&
                  row.billing.monthly &&
                  row.billing.subtotal.value !== row.billing.monthly.value && (
                    <span className="ml-1.5 text-[12px] font-normal text-muted line-through">
                      {row.billing.subtotal.label}
                    </span>
                  )}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted">プラン</dt>
              <dd className="mt-1 text-sm text-ink">
                {planLabel(row.plan)}
                <span className="ml-1 text-[11px] text-muted">（{planSourceLabel(row.planSource)}）</span>
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted">次回請求</dt>
              <dd className="mt-1 text-sm text-ink tabular-nums">{formatDate(row.billing.nextPaymentAt)}</dd>
            </div>
          </dl>

          {row.billing.coupon && (
            <div className="mt-4 rounded-sm border border-line bg-surface p-3 text-[13px]">
              <span className="font-bold text-ink">クーポン適用中</span>
              <span className="ml-2 text-ink">{row.billing.coupon.name}</span>
              <span className="ml-2 text-accent">{row.billing.coupon.effectLabel}</span>
              <span className="ml-2 text-[12px] text-muted">
                {row.billing.coupon.cyclesRemaining === null
                  ? "無期限"
                  : `残り ${row.billing.coupon.cyclesRemaining} 回`}
              </span>
            </div>
          )}

          <div className="mt-4 border-t border-line pt-4">
            <PromoSelect userId={row.userId} value={row.promo} endpoint="/api/agency/promo" subscribed={row.billing.status === "active" || row.billing.status === "trial"} />
          </div>

          <p className="mt-4 text-[11px] text-muted">
            登録 {formatDate(row.createdAt)} · 最終利用 {formatDate(row.lastActiveAt)}
          </p>
        </Card>
      ))}
    </div>
  );
}
