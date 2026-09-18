"use client";

/**
 * 割引コード（お客様コード）の入力欄。料金表の上に置く。
 *
 * 「確認」でサーバーに問い合わせ、通ったコードだけをブラウザに保存する（promoCodeStore）。
 * スタンダードの「申し込む」（PlanCheckoutButton）がそれを Checkout に渡す。
 * どんな割引があるかは公開しない（コードを確認した人にだけ、その内容を出す）。
 */
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { useStore } from "@/lib/store/hooks";
import { EMPTY_PROMO_CODE, promoCodeStore } from "@/lib/store/promo";

export function PromoCodeField({ className = "" }: { className?: string }) {
  const [applied, setApplied] = useStore(promoCodeStore);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function check() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/promo", {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: draft }),
      });
      const body = (await res.json().catch(() => ({}))) as { code?: string; label?: string; error?: string };
      if (!res.ok || !body.code || !body.label) throw new Error(body.error || `確認できませんでした（HTTP ${res.status}）`);
      setApplied({ code: body.code, label: body.label });
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "確認できませんでした");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`rounded-lg border border-line bg-panel p-4 ${className}`} aria-labelledby="promo-code-heading">
      <h2 id="promo-code-heading" className="text-[13px] font-bold text-ink">
        割引コードをお持ちの方
      </h2>
      {applied.code ? (
        <div className="mt-2 flex flex-wrap items-center gap-3 text-[13px] leading-relaxed text-ink">
          <p>
            コード <span className="font-mono font-bold">{applied.code}</span> を確認しました: {applied.label}。スタンダードの「申し込む」を押すと反映されます。
          </p>
          <Button type="button" size="sm" variant="ghost" onClick={() => setApplied(EMPTY_PROMO_CODE)}>
            コードを外す
          </Button>
        </div>
      ) : (
        <form
          className="mt-2 flex flex-wrap items-start gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void check();
          }}
        >
          <div className="min-w-0 flex-1">
            <Input
              name="promoCode"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="コードを入力"
              autoComplete="off"
              spellCheck={false}
              maxLength={64}
              aria-label="割引コード"
              invalid={!!error}
              disabled={busy}
            />
            {error && (
              <p className="mt-1 text-[12px] text-fail" role="alert">
                {error}
              </p>
            )}
          </div>
          <Button type="submit" size="lg" variant="secondary" loading={busy} disabled={busy || draft.trim().length === 0}>
            確認
          </Button>
        </form>
      )}
      <p className="mt-2 text-[12px] leading-relaxed text-muted">スタンダードプランでお使いいただけます。コードをお持ちでない場合は、そのまま各プランの「申し込む」へお進みください。</p>
    </section>
  );
}
