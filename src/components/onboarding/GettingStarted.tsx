/**
 * 申し込みが終わった人に出す「はじめかた」3 ステップ。
 *
 * カード登録の直後は、まだ何も繋がっていない（Google 連携も店舗もない）。何をすれば
 * 数字が出るのかをここで示す。手順そのものは src/lib/onboarding/steps.ts。
 */
import Link from "next/link";
import { buttonClass } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ONBOARDING_STEPS } from "@/lib/onboarding/steps";

export function GettingStarted({ className = "" }: { className?: string }) {
  return (
    <Card
      title="はじめかた"
      description="ご契約ありがとうございます。この 3 つを済ませると、順位・流入・店舗の数値がそろいます。"
      className={className}
    >
      <ol className="space-y-4">
        {ONBOARDING_STEPS.map((step) => (
          <li key={step.n} className="flex gap-3">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-[12px] font-bold text-on-brand">
              {step.n}
            </span>
            <div className="min-w-0">
              <p className="text-[14px] font-bold text-ink">
                {step.title}
                {step.optional && <span className="ml-2 rounded-sm border border-line px-1 text-[11px] font-normal text-muted">任意</span>}
              </p>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">{step.body}</p>
              <p className="mt-2">
                <Link href={step.href} className={buttonClass("secondary", "sm")}>
                  {step.linkLabel}
                </Link>
              </p>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
