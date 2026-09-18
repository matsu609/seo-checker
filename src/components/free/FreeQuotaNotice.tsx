/**
 * 無料診断の残り回数の表示。使い切ったら料金プランへの導線に変わる。
 * quota が null（認証が無効な環境）なら何も出さない。
 */
import Link from "next/link";
import { Callout } from "@/components/ui/Callout";
import { buttonClass } from "@/components/ui/Button";
import { PLANS_PATH } from "@/lib/free/upsell";
import { isExhausted, type FreeQuota } from "@/lib/free/quota-rules";
import { OPERATOR } from "@/lib/legal/operator";

export function FreeQuotaNotice({ quota, className = "" }: { quota: FreeQuota | null; className?: string }) {
  if (!quota) return null;
  if (quota.unlimited) {
    const why = quota.reason === "admin" ? "運用者のため回数制限はありません" : quota.reason === "paid" ? "契約済みのため回数制限はありません" : "回数制限はありません";
    return <p className={`no-print text-[12px] text-muted ${className}`}>{why}。</p>;
  }
  if (isExhausted(quota)) {
    return (
      <Callout tone="warn" className={`no-print ${className}`} title={`無料診断の ${quota.limit} 回を使い切りました`}>
        <p className="leading-relaxed">
          無料診断は登録したメールアドレスごとに {quota.limit} 回までです。実データを使った精密診断・毎週の計測・AI の改修案は、料金プランからお申し込みいただけます。
          迷っている点があれば、お気軽にご相談ください。
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href={PLANS_PATH} className={buttonClass("primary", "sm")}>
            料金プランを見る
          </Link>
          {OPERATOR.email && (
            <a href={`mailto:${OPERATOR.email}?subject=${encodeURIComponent("無料診断のあとのご相談")}`} className={buttonClass("secondary", "sm")}>
              運営者に相談する
            </a>
          )}
        </div>
      </Callout>
    );
  }
  return (
    <p className={`no-print text-[12px] text-muted ${className}`} role="status">
      無料診断は登録したメールアドレスごとに {quota.limit} 回まで（サイト・店舗の合計）。<span className="font-bold text-ink">残り {quota.remaining} 回</span>です。
    </p>
  );
}
