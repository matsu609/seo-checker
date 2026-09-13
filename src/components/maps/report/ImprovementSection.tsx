/**
 * 優先改善リスト（MEO 報告書）。表示だけ。
 *
 * 「配点 × 現状」で戻ってくる点数の大きい順に並べ、いまの状態とやることを添える。
 * 未取得（オーナーにしか分からない）項目は点数が動かないのでリストには出さず、
 * まとめて案内する（クイック診断では精密診断への導線を兼ねる）。
 */
import Link from "next/link";
import { Advice, EmptyLine, Num, ReportSection, SubHeading } from "@/components/free/report-parts";
import { Badge } from "@/components/ui/Badge";
import type { MeoImprovementPlan } from "@/lib/maps/improvements";

export interface ImprovementSectionProps {
  plan: MeoImprovementPlan;
  number: number;
  /** クイック診断（無料）なら、未取得の項目から精密診断へ案内する */
  variant: "paid" | "free";
  /** 何件まで出すか（既定 8 件） */
  limit?: number;
}

export function ImprovementSection({ plan, number, variant, limit = 8 }: ImprovementSectionProps) {
  const items = plan.items.slice(0, limit);
  const rest = plan.items.length - items.length;

  return (
    <ReportSection number={number} title="優先的に直すところ" lead="戻ってくる点数の大きい順です。上から順に手をつければ、最短で点数が上がります。">
      {items.length === 0 ? (
        <EmptyLine>測定できた項目はすべて満たしています。次は口コミの件数と新しさを保つことに集中してください。</EmptyLine>
      ) : (
        <>
          {plan.currentScore !== null && plan.scoreAfterTop3 !== null && plan.scoreAfterTop3 > plan.currentScore && (
            <p className="mb-3 rounded-sm border border-line bg-surface px-3 py-2 text-[13px] leading-relaxed text-ink">
              上の 3 つを直すと <Num>{plan.currentScore}</Num> 点 → <Num>{plan.scoreAfterTop3}</Num> 点になります。
            </p>
          )}
          <ol className="divide-y divide-line border-y border-line">
            {items.map((item, i) => (
              <li key={item.id} className="py-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[13px] font-bold text-accent tabular-nums">{i + 1}</span>
                  <span className="text-[14px] font-bold text-ink">{item.label}</span>
                  <Badge tone={item.status === "fail" ? "fail" : "warn"}>{item.status === "fail" ? "要改善" : "注意"}</Badge>
                  <span className="text-[12px] text-muted">{item.categoryLabel}</span>
                  <span className="ml-auto text-[13px] font-bold text-accent tabular-nums">{item.gainLabel}</span>
                </div>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">いまの状態: {item.detail}</p>
                {item.advice && <Advice className="mt-1">{item.advice}</Advice>}
              </li>
            ))}
          </ol>
          {rest > 0 && <p className="mt-2 text-[12px] text-muted">ほかに {rest} 件あります（各カテゴリのチェックリストをご覧ください）。</p>}
          <p className="mt-2 text-[11px] text-muted">※ 点数は配点からの試算です（合格 = 満点、注意 = 半分、要改善 = 0 点）。</p>
        </>
      )}

      {plan.ownerOnly.length > 0 && (
        <>
          <SubHeading className="mt-6" note={`配点 ${plan.ownerOnlyWeight} 点分`}>
            オーナーにしか分からない {plan.ownerOnly.length} 項目
          </SubHeading>
          <p className="mt-1 text-[13px] leading-relaxed text-ink">
            {plan.ownerOnly.map((c) => c.label).join("・")}
            は、Google マップの公開情報からは取れません。今回の点数はこの {plan.ownerOnly.length} 項目を除いた分で計算しています（
            <Num>{plan.ownerOnlyWeight}</Num> 点分が未測定）。
          </p>
          {variant === "free" ? (
            <p className="no-print mt-2 text-[13px] leading-relaxed text-ink">
              <Link href="/sign-up" className="font-bold text-accent underline underline-offset-2">
                精密診断（初月無料）
              </Link>
              では、この {plan.ownerOnly.length} 項目をお店の方に答えてもらい、21 項目すべて・100 点満点で採点します。毎週の自動更新で推移も残ります。
            </p>
          ) : (
            <p className="mt-2 text-[13px] leading-relaxed text-ink">
              「オーナー情報の入力」に答えると、この {plan.ownerOnly.length} 項目も採点に入り、100 点満点での評価になります。
            </p>
          )}
        </>
      )}
    </ReportSection>
  );
}
