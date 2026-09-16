"use client";

/**
 * 指名検索ビュー（仕様書 §3.2）。
 *
 * 指名プロンプトは参照率が 95〜100% に張り付くので**主指標にしない**。
 * 代わりに 自社引用率 / 引用元構成比 / 競合同時言及率 を出す。
 */
import { Card, StatCard } from "@/components/ui";
import { pct } from "@/lib/geo/stats";
import { DOMAIN_CLASS_LABELS, type DomainClass } from "@/lib/geo/types";
import type { DashboardResponse } from "./client";

export function BrandedCard({ branded }: { branded: NonNullable<DashboardResponse["branded"]> }) {
  const mix = branded.citationMix;
  const total = (Object.values(mix) as number[]).reduce((a, b) => a + b, 0);

  return (
    <Card
      title="指名検索（自社名を含むプロンプト）"
      description="自社名で聞かれたときに「自社サイトが引用元として出るか」を見ます。参照率（名前が出るか）は指名検索ではほぼ 100% になるため、主指標にしていません。"
      printCard
    >
      <div className="grid gap-3 @2xl:grid-cols-3">
        <StatCard label="自社引用率" value={pct(branded.ownCitationRate)} hint={`指名プロンプトの観測 ${branded.n} 件のうち、自社ドメインが引用された割合`} />
        <StatCard
          label="競合同時言及率"
          value={pct(branded.competitorCoMentionRate)}
          hint="自社名で聞いた回答に競合の名前も出てくる割合。高いほど比較されやすい"
        />
        <StatCard label="引用元の総数" value={total} unit="件" hint="下の内訳の合計" />
      </div>

      {total > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 text-sm font-bold text-ink">引用元の構成比</h3>
          <div className="flex h-6 overflow-hidden rounded-sm border border-line">
            {(Object.keys(mix) as DomainClass[]).map((cls) => {
              const share = mix[cls] / total;
              if (share <= 0) return null;
              const bg = cls === "own" ? "bg-accent" : cls === "competitor" ? "bg-fail" : "bg-secondary";
              return <div key={cls} className={bg} style={{ width: `${share * 100}%` }} title={`${DOMAIN_CLASS_LABELS[cls]} ${mix[cls]} 件`} />;
            })}
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted">
            {(Object.keys(mix) as DomainClass[]).map((cls) => (
              <li key={cls}>
                {DOMAIN_CLASS_LABELS[cls]}: <span className="tabular-nums text-ink">{mix[cls]}</span> 件（{total > 0 ? pct(mix[cls] / total) : "0%"}）
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
