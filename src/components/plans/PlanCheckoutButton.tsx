"use client";

/**
 * 料金表の各プランに置く「申し込む」ボタン。押すと Stripe Checkout へ遷移する。
 *
 * プランごとにボタンを分けているのは、3 つ並べた料金表の中で「どれを買うか」を
 * そのまま押して決められるようにするため（catalog.ts の 3 段階の趣旨）。
 * カード番号はこのアプリを通らない（Stripe の画面で入力する）。
 */
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { PlanId } from "@/lib/plans/catalog";

export interface PlanCheckoutButtonProps {
  plan: PlanId;
  label: string;
  variant?: "primary" | "secondary";
  className?: string;
}

export function PlanCheckoutButton({ plan, label, variant = "primary", className = "" }: PlanCheckoutButtonProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const body = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !body.url) throw new Error(body.error || `リクエストに失敗しました（HTTP ${res.status}）`);
      window.location.assign(body.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "申し込み画面を開けませんでした");
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <Button type="button" size="lg" variant={variant} className="w-full" onClick={go} loading={busy} disabled={busy}>
        {label}
      </Button>
      {error && <p className="mt-2 text-[12px] leading-relaxed text-fail">{error}</p>}
    </div>
  );
}
