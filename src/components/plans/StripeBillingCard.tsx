"use client";

/**
 * Stripe 直結の申し込みとお支払いの管理（料金プランの画面に出す）。
 *
 * 申し込みボタンは料金表の各プランの中（PlanCheckoutButton）に置いてある。ここが持つのは、
 * 契約中の状態の表示と「お支払い方法の変更・請求書・解約」→ /api/billing/portal → Stripe カスタマーポータル。
 * カード番号はこのアプリを通らない（Stripe の画面で入力・変更する）。
 */
import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card } from "@/components/ui/Card";
import { hasStripeSubscription, planFromStripeState, STRIPE_STATUS_LABELS, type StripeState } from "@/lib/billing/state";
import { planLabel } from "@/lib/plans/catalog";
import { formatDateTime } from "@/lib/report/format";

export interface StripeBillingCardProps {
  state: StripeState | null;
  /** Stripe の顧客がある（申し込み画面を一度でも通った）か。契約が終わっていても請求書は見られる */
  hasCustomer: boolean;
  /** 本番キーでなければ「テストモード」を出す */
  live: boolean;
  /** ?checkout=success / cancel で戻ってきたときの案内 */
  checkoutResult: "success" | "cancel" | null;
  /** 無料期間の日数（0 ならトライアルなし） */
  trialDays: number;
  /** 契約済みのときに案内するツールの入口 */
  firstToolPath: string;
}

async function open(path: string): Promise<string> {
  const res = await fetch(path, { method: "POST", cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !body.url) throw new Error(body.error || `リクエストに失敗しました（HTTP ${res.status}）`);
  return body.url;
}

function formatAmount(state: StripeState): string | null {
  if (state.amount === null || !state.currency) return null;
  const zeroDecimal = ["JPY", "KRW", "VND"].includes(state.currency);
  return new Intl.NumberFormat("ja-JP", { style: "currency", currency: state.currency, minimumFractionDigits: zeroDecimal ? 0 : 2 }).format(zeroDecimal ? state.amount : state.amount / 100);
}

export function StripeBillingCard({ state, hasCustomer, live, checkoutResult, trialDays, firstToolPath }: StripeBillingCardProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const subscribed = hasStripeSubscription(state);
  const contracted = planFromStripeState(state);

  async function openPortal() {
    setBusy(true);
    setError(null);
    try {
      const url = await open("/api/billing/portal");
      window.location.assign(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "開けませんでした");
      setBusy(false);
    }
  }

  return (
    <Card title="お申し込み・お支払い" description="お支払いはクレジットカード（Stripe）です。カードの変更・請求書の確認・解約は Stripe の画面で行えます。" className="mt-6">
      {checkoutResult === "success" && (
        <Callout tone="pass" title="お申し込みありがとうございます" className="mb-4">
          <p>
            {trialDays > 0
              ? `カードの登録が完了しました。最初の ${trialDays} 日間は無料です。`
              : "お申し込みが完了しました。"}
            反映まで数秒かかることがあります。この画面を開き直しても「契約中」にならない場合は運用者までご連絡ください。
          </p>
          {subscribed && (
            <p className="mt-3">
              <ButtonLink href={firstToolPath}>ツールを使いはじめる</ButtonLink>
            </p>
          )}
        </Callout>
      )}
      {checkoutResult === "cancel" && (
        <Callout tone="info" className="mb-4">
          お申し込みは完了していません。いつでもやり直せます。
        </Callout>
      )}
      {!live && (
        <Callout tone="warn" className="mb-4">
          テストモードです。実際の請求は発生しません（テストカード 4242 4242 4242 4242 で確認できます）。
        </Callout>
      )}

      {state && (
        <dl className="mb-4 grid gap-x-6 gap-y-1 text-[13px] md:grid-cols-4">
          {contracted && (
            <div>
              <dt className="text-muted">ご契約のプラン</dt>
              <dd className="font-bold text-ink">{planLabel(contracted)}</dd>
            </div>
          )}
          <div>
            <dt className="text-muted">契約状況</dt>
            <dd className="font-bold text-ink">
              {STRIPE_STATUS_LABELS[state.status]}
              {state.cancelAtPeriodEnd && subscribed ? "（期間末で解約予定）" : ""}
            </dd>
          </div>
          {formatAmount(state) && (
            <div>
              <dt className="text-muted">月額</dt>
              <dd className="text-ink">{formatAmount(state)}</dd>
            </div>
          )}
          {state.currentPeriodEnd && (
            <div>
              <dt className="text-muted">
                {state.cancelAtPeriodEnd ? "ご利用期限" : state.status === "trialing" ? "無料期間の終了（初回の請求日）" : "次回の更新"}
              </dt>
              <dd className="text-ink">{formatDateTime(state.currentPeriodEnd)}</dd>
            </div>
          )}
        </dl>
      )}

      {error && (
        <Callout tone="fail" className="mb-4">
          {error}
        </Callout>
      )}

      {!subscribed && trialDays > 0 && (
        <Callout tone="info" className="mb-4" title={`最初の ${trialDays} 日間は無料です`}>
          お申し込み時はカードの登録だけで、料金はかかりません。{trialDays} 日を過ぎた日に初回の月額をお支払いいただき、以降は毎月同じ日に自動で決済されます。無料期間中に解約すれば料金は発生しません。
        </Callout>
      )}

      {!subscribed && (
        <p className="mb-4 text-[13px] leading-relaxed text-ink">
          お申し込みは、上の料金プランからご希望の段階の「申し込む」を押してください。プレミアム（伴走）は空き枠の確認が要るため、お問い合わせから承ります。
        </p>
      )}

      {hasCustomer && (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" size="lg" variant={subscribed ? "primary" : "secondary"} onClick={openPortal} loading={busy} disabled={busy}>
            {subscribed ? "お支払い方法の変更・プランの変更・請求書・解約" : "請求書を確認する"}
          </Button>
        </div>
      )}
      <p className="mt-3 text-[12px] leading-relaxed text-muted">
        割引コード（月額の値引き、または初月無料）をお持ちの場合は、申し込み画面の「プロモーションコードを追加」から入力してください。コードを入力しない場合は定価で決済されます。プランの変更（ライト ⇄ スタンダード）と解約は、上のボタンから開く Stripe の画面で行えます。解約は次回の更新日まで利用でき、日割りの返金はありません。詳しくは
        <a href="/legal/tokushoho" className="underline">
          特定商取引法に基づく表記
        </a>
        をご覧ください。
      </p>
    </Card>
  );
}
