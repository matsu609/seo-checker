/**
 * 無料診断の結果の下に出す、詳細診断（本サービス）への導線。
 *
 * 無料で完結させないための部品（利用者の決定 2026-09-13）。無料の限界を言ってから、
 * 詳細診断で増えることを具体的に並べ、申し込み（/sign-up）へ一本道で送る。
 * 文言は src/lib/free/upsell.ts に集約してあり、サイト用と店舗用で言うことをずらさない。
 *
 * 印刷・PDF には出さない（no-print）。報告書はそのままお客様に渡せる形で残す。
 */
import Link from "next/link";
import { buttonClass } from "@/components/ui/Button";
import { PLANS_PATH, SIGN_UP_PATH, UPSELL, type FreeKind } from "@/lib/free/upsell";
import { PLAN_BY_ID } from "@/lib/plans/catalog";
import { ServiceGuideButton } from "./ServiceGuideButton";

export function UpgradeCta({ kind, className = "" }: { kind: FreeKind; className?: string }) {
  const copy = UPSELL[kind];
  const pro = PLAN_BY_ID.pro;

  return (
    <section className={`no-print rounded-sm border border-accent/40 bg-accent-soft p-5 md:p-6 ${className}`} aria-labelledby="upgrade-cta-title">
      <h2 id="upgrade-cta-title" className="text-[16px] font-bold text-ink">
        {copy.title}
      </h2>
      <p className="mt-2 text-[13px] leading-relaxed text-ink">{copy.limit}</p>

      <p className="mt-4 text-[13px] font-bold text-ink">詳細診断（{pro.label}）で分かること</p>
      <ul className="mt-2 space-y-1.5">
        {copy.points.map((point) => (
          <li key={point} className="flex gap-2 text-[13px] leading-relaxed text-ink">
            <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
            <span>{point}</span>
          </li>
        ))}
      </ul>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Link href={SIGN_UP_PATH} className={buttonClass("primary", "lg")}>
          {copy.cta}
        </Link>
        <ServiceGuideButton />
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-muted">
        初月無料。お申し込み時はカードのご登録だけで、無料期間中に解約すれば料金はかかりません（以降は月額{" "}
        {pro.priceYen.toLocaleString("ja-JP")} 円・税別）。
        <Link href={PLANS_PATH} className="ml-1 text-accent underline underline-offset-2">
          料金の詳細
        </Link>
      </p>
    </section>
  );
}
