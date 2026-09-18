"use client";

/**
 * 顧客の割引（スタンダード専用の 10 パターン）を選ぶ。マスター画面と代理店画面で共用。
 *
 * endpoint だけが違う（/api/admin/promo か /api/agency/promo）。選んだ瞬間に保存し、
 * 失敗したら元に戻す。設定すると顧客の料金プラン画面に「割引が設定されています」と出て、
 * スタンダードの申し込みに自動で付く（既に契約中の人の請求は変わらない。Stripe で直す）。
 */
import { useState } from "react";
import { Select } from "@/components/ui/Field";
import { patternById, patternLabel, patternShortLabel, PROMO_PATTERNS } from "@/lib/billing/promo";

const NONE = "none";

export interface PromoSelectProps {
  userId: string;
  /** 設定済みのパターン名（無ければ null） */
  value: string | null;
  endpoint: "/api/admin/promo" | "/api/agency/promo";
  /** 契約中なら注意書きを出す（設定しても今の請求は変わらない） */
  subscribed?: boolean;
}

export function PromoSelect({ userId, value, endpoint, subscribed = false }: PromoSelectProps) {
  const [current, setCurrent] = useState<string | null>(value);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(next: string | null) {
    const before = current;
    setCurrent(next);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, pattern: next }),
      });
      const body = (await res.json().catch(() => ({}))) as { promo?: string | null; error?: string };
      if (!res.ok) throw new Error(body.error ?? `保存できませんでした（HTTP ${res.status}）`);
      setCurrent(body.promo ?? null);
    } catch (err) {
      setCurrent(before);
      setError(err instanceof Error ? err.message : "保存できませんでした");
    } finally {
      setBusy(false);
    }
  }

  const pattern = current ? patternById(current) : null;
  const id = `promo-${userId}`;
  return (
    <div>
      <label htmlFor={id} className="text-[12px] font-bold text-ink">
        割引
        <span className="ml-2 font-normal text-muted">スタンダードのお申し込みに付きます。選ぶとすぐ保存されます。</span>
      </label>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <Select id={id} className="max-w-xs" value={current ?? NONE} disabled={busy} onChange={(e) => void save(e.target.value === NONE ? null : e.target.value)}>
          <option value={NONE}>割引なし（定価）</option>
          {PROMO_PATTERNS.map((p) => (
            <option key={p.id} value={p.id}>
              {patternShortLabel(p)}
            </option>
          ))}
        </Select>
        {pattern && <span className="text-[12px] text-ink">{patternLabel(pattern)}</span>}
      </div>
      {pattern && subscribed && (
        <p className="mt-1 text-[12px] text-warn">この方は契約中です。今の請求は変わりません（Stripe の顧客画面で割引を付けてください）。次にスタンダードを申し込み直すときに付きます。</p>
      )}
      {error && (
        <p className="mt-1 text-[12px] text-fail" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
