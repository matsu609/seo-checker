/**
 * クイック診断の結果の下に出す、精密診断（本サービス）への導線。
 *
 * 無料で完結させないための部品（利用者の決定 2026-09-13）。クイック診断の限界を言ってから、
 * 精密診断で増えることを具体的に並べ、申し込み（/sign-up）へ一本道で送る。
 * 文言は src/lib/free/upsell.ts に集約してあり、サイト用と店舗用で言うことをずらさない。
 *
 * 印刷・PDF には出さない（no-print）。報告書はそのままお客様に渡せる形で残す。
 */
import Link from "next/link";
import { buttonClass } from "@/components/ui/Button";
import { PAID_DIAGNOSIS_LABEL } from "@/lib/features/registry";
import { PLANS_PATH, UPSELL, type FreeKind } from "@/lib/free/upsell";
import { PLAN_BY_ID, RECOMMENDED_PLAN } from "@/lib/plans/catalog";
import { ServiceGuideButton } from "./ServiceGuideButton";

export interface UpgradeCtaProps {
  kind: FreeKind;
  /** 上限で打ち切ったときの一言（例: 見つかった 128 ページのうち 10 ページを診断しました） */
  note?: string | null;
  className?: string;
}

export function UpgradeCta({ kind, note = null, className = "" }: UpgradeCtaProps) {
  const copy = UPSELL[kind];
  // 名前を出すのは本命のスタンダード。安い段（ライト）は「もある」として最後に添えるだけにする
  const main = RECOMMENDED_PLAN;
  const light = PLAN_BY_ID.light;

  return (
    <section className={`no-print rounded-sm border border-accent/40 bg-accent-soft p-5 md:p-6 ${className}`} aria-labelledby="upgrade-cta-title">
      <h2 id="upgrade-cta-title" className="text-[16px] font-bold text-ink">
        {copy.title}
      </h2>
      {note && <p className="mt-2 rounded-sm border border-accent/30 bg-panel px-3 py-2 text-[13px] leading-relaxed font-bold text-ink">{note}</p>}
      <p className="mt-2 text-[13px] leading-relaxed text-ink">{copy.limit}</p>

      <p className="mt-4 text-[13px] font-bold text-ink">
        {PAID_DIAGNOSIS_LABEL}（{main.label}）で分かること
      </p>
      <ul className="mt-2 space-y-1.5">
        {copy.points.map((point) => (
          <li key={point} className="flex gap-2 text-[13px] leading-relaxed text-ink">
            <span aria-hidden className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
            <span>{point}</span>
          </li>
        ))}
      </ul>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Link href={PLANS_PATH} className={buttonClass("primary", "lg")}>
          {copy.cta}
        </Link>
        <ServiceGuideButton />
      </div>
      <p className="mt-3 text-[12px] leading-relaxed text-muted">
        初月無料。お申し込み時はカードのご登録だけで、無料期間中に解約すれば料金はかかりません（以降は月額{" "}
        {main.priceYen.toLocaleString("ja-JP")} 円・税込。AI が改修案・原稿を作らない{light.label}は{" "}
        {light.priceYen.toLocaleString("ja-JP")} 円）。
        <Link href={PLANS_PATH} className="ml-1 text-accent underline underline-offset-2">
          料金の詳細
        </Link>
      </p>
    </section>
  );
}
