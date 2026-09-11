"use client";

/**
 * Stripe 直結の申し込みとお支払いの管理（料金プランの画面に出す）。
 *
 * - 契約が無ければ「オールインワンを申し込む」→ /api/billing/checkout → Stripe Checkout へ遷移
 * - 契約があれば「お支払い方法の変更・請求書・解約」→ /api/billing/portal → Stripe カスタマーポータルへ遷移
 * カード番号はこのアプリを通らない（Stripe の画面で入力・変更する）。
 */
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Callout } from "@/components/ui/Callout";
import { Card } from "@/components/ui/Card";
import { hasStripeSubscription, STRIPE_STATUS_LABELS, type StripeState } from "@/lib/billing/state";
import { PLAN_BY_ID } from "@/lib/plans/catalog";
import { formatDateTime } from "@/lib/report/format";

export interface StripeBillingCardProps {
  state: StripeState | null;
  /** Stripe の顧客がある（申し込み画面を一度でも通った）か。契約が終わっていても請求書は見られる */
  hasCustomer: boolean;
  /** 本番キーでなければ「テストモード」を出す */
  live: boolean;
  /** ?checkout=success / cancel で戻ってきたときの案内 */
  checkoutResult: "success" | "cancel" | null;
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

export function StripeBillingCard({ state, hasCustomer, live, checkoutResult }: StripeBillingCardProps) {
  const [busy, setBusy] = useState<"checkout" | "portal" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const subscribed = hasStripeSubscription(state);
  const pro = PLAN_BY_ID.pro;

  async function go(kind: "checkout" | "portal") {
    setBusy(kind);
    setError(null);
    try {
      const url = await open(kind === "checkout" ? "/api/billing/checkout" : "/api/billing/portal");
      window.location.assign(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "開けませんでした");
      setBusy(null);
    }
  }

  return (
    <Card title="お申し込み・お支払い" description="お支払いはクレジットカード（Stripe）です。カードの変更・請求書の確認・解約は Stripe の画面で行えます。" className="mt-6">
      {checkoutResult === "success" && (
        <Callout tone="pass" title="お申し込みありがとうございます" className="mb-4">
          決済が完了しました。反映まで数秒かかることがあります。この画面を開き直しても「契約中」にならない場合は運用者までご連絡ください。
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
              <dt className="text-muted">{state.cancelAtPeriodEnd ? "ご利用期限" : "次回の更新"}</dt>
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

      <div className="flex flex-wrap items-center gap-3">
        {!subscribed && (
          <Button type="button" size="lg" onClick={() => go("checkout")} loading={busy === "checkout"} disabled={busy !== null}>
            {pro.label}（月額 {pro.priceYen.toLocaleString("ja-JP")} 円・税別）を申し込む
          </Button>
        )}
        {hasCustomer && (
          <Button type="button" size="lg" variant={subscribed ? "primary" : "secondary"} onClick={() => go("portal")} loading={busy === "portal"} disabled={busy !== null}>
            {subscribed ? "お支払い方法の変更・請求書・解約" : "請求書を確認する"}
          </Button>
        )}
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-muted">
        申し込み画面ではクーポンコードを入力できます。解約は次回の更新日まで利用でき、日割りの返金はありません。詳しくは
        <a href="/legal/tokushoho" className="underline">
          特定商取引法に基づく表記
        </a>
        をご覧ください。
      </p>
    </Card>
  );
}
