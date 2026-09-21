"use client";

/**
 * 月額費用の試算（利用者の指示 2026-09-21「API の連携済みか否かのページでは、使用料金予測、
 * 店舗数における料金予測と固定でかかる料金をグラフで表示させて、毎月これぐらいかかるよという
 * 試算を表示させてほしい」）。運用者だけが見るマスター画面に置く。
 *
 * 計算は src/lib/cost/model.ts の純関数。ここは入力（店舗数・プランの割合・為替・Vercel / Clerk の Pro）
 * を受け取って、①いまの店舗数の KPI ②店舗数を横軸にした積み上げ棒（どのサービスがいくらか）
 * ③1 店舗あたりの原価の折れ線 ④サービスごとの内訳表 ⑤前提の表 を出す。
 *
 * 守ること: 前提を隠さない。単価は PRICING_CHECKED_AT 時点の値で、変われば model.ts の A を直す。
 */
import { useMemo, useState } from "react";
import { LineChart, StackedBar } from "@/components/charts";
import { Badge, Callout, Card, StatCard } from "@/components/ui";
import { assumptions, COST_SERIES, costSteps, DEFAULT_COST_INPUT, estimateMonthlyCost, seriesTotals, type CostInput } from "@/lib/cost/model";
import { INTEGRATIONS, PRICING_CHECKED_AT } from "@/lib/features/integrations";
import { palette } from "@/lib/ui/palette";

const yen = (n: number) => `¥${Math.round(n).toLocaleString("ja-JP")}`;

/** スタンダードの割合の選択肢 */
const RATIO_OPTIONS = [
  { value: 1, label: "全店スタンダード（50,000 円）" },
  { value: 0.5, label: "半々（ライト / スタンダード）" },
  { value: 0, label: "全店ライト（38,000 円）" },
] as const;

export function CostForecastCard() {
  const [input, setInput] = useState<CostInput>(DEFAULT_COST_INPUT);
  const set = <K extends keyof CostInput>(k: K, v: CostInput[K]) => setInput((prev) => ({ ...prev, [k]: v }));

  const est = useMemo(() => estimateMonthlyCost(input), [input]);
  const steps = useMemo(() => costSteps(input.stores), [input.stores]);
  const series = useMemo(() => steps.map((stores) => estimateMonthlyCost({ ...input, stores })), [steps, input]);

  const stacked = COST_SERIES.map((s, i) => ({
    label: s.label,
    color: palette.chart[i % palette.chart.length],
    values: series.map((e) => seriesTotals(e)[s.id]),
  }));
  const labels = steps.map((n) => `${n} 店`);

  return (
    <Card
      title="月額費用の試算（店舗数ごと）"
      description={`契約している店舗（お客様）の数を横軸に、毎月かかる原価を出します。固定費（Vercel・ドメイン・SerpApi の月額プランなど、店舗数に関係なくかかるもの）と変動費（DataForSEO・Google マップ・Claude・Stripe の手数料。店舗が増えると増えるもの）に分けています。単価は ${PRICING_CHECKED_AT} 時点の公開料金、使用量はこのツールの定期処理の回数からの見込みです（下の「前提」）。`}
      actions={<Badge tone="neutral" icon={false}>試算</Badge>}
    >
      {/* 入力 */}
      <div className="grid gap-3 rounded-sm border border-line bg-surface p-3 text-[12px] @xl:grid-cols-4">
        <label className="block">
          <span className="mb-1 block text-[11px] font-bold text-muted">店舗数（契約数）</span>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={200}
              step={1}
              value={input.stores}
              onChange={(e) => set("stores", Number(e.target.value))}
              className="w-full accent-brand"
              aria-label="店舗数"
            />
            <input
              type="number"
              min={0}
              max={10_000}
              value={input.stores}
              onChange={(e) => set("stores", Math.max(0, Math.floor(Number(e.target.value) || 0)))}
              className="w-20 rounded-sm border border-line bg-panel px-2 py-1 text-right tabular-nums text-ink"
              aria-label="店舗数（数値）"
            />
          </div>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-bold text-muted">プランの内訳</span>
          <select
            value={String(input.standardRatio)}
            onChange={(e) => set("standardRatio", Number(e.target.value))}
            className="w-full rounded-sm border border-line bg-panel px-2 py-1 text-ink"
          >
            {RATIO_OPTIONS.map((o) => (
              <option key={o.value} value={String(o.value)}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-bold text-muted">為替（1 USD = 円）</span>
          <input
            type="number"
            min={50}
            max={500}
            step={1}
            value={input.usdJpy}
            onChange={(e) => set("usdJpy", Number(e.target.value) || DEFAULT_COST_INPUT.usdJpy)}
            className="w-full rounded-sm border border-line bg-panel px-2 py-1 text-right tabular-nums text-ink"
          />
        </label>
        <div className="flex flex-col justify-end gap-1.5">
          <label className="flex items-center gap-2 text-ink">
            <input type="checkbox" checked={input.vercelPro} onChange={(e) => set("vercelPro", e.target.checked)} className="accent-brand" />
            Vercel Pro（$20。Hobby は非商用に限る）
          </label>
          <label className="flex items-center gap-2 text-ink">
            <input type="checkbox" checked={input.clerkPro} onChange={(e) => set("clerkPro", e.target.checked)} className="accent-brand" />
            Clerk Pro（$25。任意）
          </label>
        </div>
      </div>

      {/* KPI */}
      <div className="mt-4 grid grid-cols-2 gap-3 @xl:grid-cols-5">
        <StatCard label={`月額の原価（${est.input.stores} 店）`} value={yen(est.totalJpy)} hint="固定費 + 変動費" />
        <StatCard label="固定費" value={yen(est.fixedJpy)} hint="店舗数に関係なくかかる" />
        <StatCard label="変動費" value={yen(est.variableJpy)} hint="店舗が増えると増える" />
        <StatCard label="1 店舗あたりの原価" value={yen(est.perStoreJpy)} hint="固定費は店舗数で割る" />
        <StatCard
          label="粗利率"
          value={est.grossRatio === null ? "—" : `${Math.round(est.grossRatio * 100)}%`}
          hint={est.revenueJpy > 0 ? `売上 ${yen(est.revenueJpy)} − 原価` : "店舗 0"}
        />
      </div>

      {!input.vercelPro && (
        <Callout tone="warn" className="mt-4">
          Vercel の Hobby プランは個人・非商用に限られています（いまは Hobby）。お客様に売る段階では Pro（$20 / 月）が要るので、試算は Pro を入れて見るのが安全です。
        </Callout>
      )}

      {/* 積み上げ棒: 店舗数ごとの内訳 */}
      <div className="mt-5 grid gap-5 @3xl:grid-cols-2">
        <div>
          <h3 className="text-[13px] font-bold text-ink">月額の内訳（店舗数ごと）</h3>
          <p className="mb-2 text-[11px] leading-relaxed text-muted">
            いちばん下の帯が固定費。SerpApi は月額プランなので店舗数に応じて段階的に上がる。Google マップは無料枠（SKU ごと・月）を使い切るまで 0。
          </p>
          <StackedBar categories={labels} series={stacked} width={520} height={200} ariaLabel="店舗数ごとの月額費用の内訳" />
        </div>
        <div>
          <h3 className="text-[13px] font-bold text-ink">1 店舗あたりの原価</h3>
          <p className="mb-2 text-[11px] leading-relaxed text-muted">固定費が薄まるので店舗が増えると下がり、変動費の水準に近づく。</p>
          <LineChart
            labels={labels}
            series={[
              { id: "per-store", label: "1 店舗あたりの原価", values: series.map((e) => e.perStoreJpy) },
              { id: "variable-per-store", label: "うち変動費", values: series.map((e) => (e.input.stores > 0 ? Math.round(e.variableJpy / e.input.stores) : null)) },
            ]}
            yMin={0}
            height={200}
            format={(v) => (v === null ? "—" : yen(v))}
            ariaLabel="店舗数ごとの 1 店舗あたりの原価"
            xHeader="店舗数"
          />
        </div>
      </div>

      {/* 内訳表 */}
      <div className="mt-5">
        <h3 className="text-[13px] font-bold text-ink">サービスごとの内訳（{est.input.stores} 店のとき）</h3>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-y border-line text-left text-[11px] text-muted">
                <th className="py-1.5 pr-3 font-bold">サービス</th>
                <th className="py-1.5 pr-3 text-right font-bold">固定</th>
                <th className="py-1.5 pr-3 text-right font-bold">変動</th>
                <th className="py-1.5 pr-3 text-right font-bold">合計</th>
                <th className="py-1.5 font-bold">計算の根拠</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {[...est.lines]
                .sort((a, b) => b.fixedJpy + b.variableJpy - (a.fixedJpy + a.variableJpy))
                .map((l) => (
                  <tr key={l.key} className={l.fixedJpy + l.variableJpy === 0 ? "text-muted" : "text-ink"}>
                    <td className="py-1.5 pr-3 font-bold">{INTEGRATIONS[l.key].label}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{yen(l.fixedJpy)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{yen(l.variableJpy)}</td>
                    <td className="py-1.5 pr-3 text-right font-bold tabular-nums">{yen(l.fixedJpy + l.variableJpy)}</td>
                    <td className="py-1.5 leading-relaxed">{l.note}</td>
                  </tr>
                ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line font-bold text-ink">
                <td className="py-1.5 pr-3">合計</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{yen(est.fixedJpy)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{yen(est.variableJpy)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{yen(est.totalJpy)}</td>
                <td className="py-1.5 text-muted">売上 {yen(est.revenueJpy)} → 粗利 {yen(est.grossJpy)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* 前提 */}
      <details className="mt-4">
        <summary className="cursor-pointer text-[12px] font-bold text-accent">前提（単価・使用量）を見る</summary>
        <dl className="mt-2 grid gap-2 text-[12px] leading-relaxed @xl:grid-cols-2">
          {assumptions().map((a, i) => (
            <div key={`${a.key}-${i}`} className="rounded-sm border border-line bg-surface p-2">
              <dt className="text-[11px] font-bold text-muted">{a.label}</dt>
              <dd className="text-ink">{a.value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          この試算に入れていないもの: プレミアム（人の作業）、お客様が手動で何度も回すぶん（Claude・SerpApi）、DataForSEO の 24 時間キャッシュによる節約（同じ語を複数のお客様が登録すると実費は下がる）、Vercel の帯域・実行時間の超過。実費は各サービスのダッシュボード（上の「外部連携」のリンク）で確かめてください。
        </p>
      </details>
    </Card>
  );
}
