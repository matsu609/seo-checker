"use client";

/**
 * ドメインパワー（サイト全体の地力）のカード。
 *
 * 有料の被リンク指標（Ahrefs の DR、Moz の DA）は使わず、無料で取れる
 * 8 つの指標を足し合わせた推定値を出す。**数字の出どころと配点を必ず開示する**
 * ため、合計点だけでなく指標ごとの得点・実測値・判定根拠を並べる。
 */
import { Donut, HBar } from "@/components/charts";
import { Badge, Card } from "@/components/ui";
import { AHREFS_ATTRIBUTION, AHREFS_URL } from "@/lib/domain-power/ahrefs";
import { GRADE_LABELS, SIGNAL_SOURCES, SIGNAL_STATUS_LABELS, type DomainPowerResult, type SignalStatus } from "@/lib/domain-power/types";

const STATUS_TONE: Record<SignalStatus, "pass" | "warn" | "fail" | "neutral"> = {
  good: "pass",
  fair: "warn",
  poor: "fail",
  unknown: "neutral",
};

export function DomainPowerCard({ domain }: { domain: DomainPowerResult }) {
  const measured = domain.signals.filter((s) => s.status !== "unknown");
  const missing = domain.signals.filter((s) => s.status === "unknown");

  return (
    <Card
      title="ドメインパワー（推定）"
      description="サイト全体の地力を 0〜100 で表した推定値です。無料で取れる 8 つの指標（外部リンクの評価・ドメインの年数・インデックス数・順位・実ユーザーの規模・規模・信頼）を配点して足し合わせています。取得できなかった指標は分母から外しています。他社のドメインパワー測定サイトと同じ数値（Ahrefs の DR・Open PageRank）は下に別枠で出しています。"
      printCard
      actions={domain.grade ? <Badge tone={domain.score !== null && domain.score >= 60 ? "pass" : domain.score !== null && domain.score >= 40 ? "warn" : "fail"} icon={false}>{GRADE_LABELS[domain.grade]}</Badge> : null}
    >
      <div className="grid gap-5 @2xl:grid-cols-[160px_1fr] @2xl:items-start">
        <div className="justify-self-center">
          {domain.score === null ? (
            <div className="flex h-[160px] w-[160px] items-center justify-center rounded-full border border-line text-center text-[12px] leading-relaxed text-muted">
              指標が
              <br />
              足りません
            </div>
          ) : (
            <Donut value={domain.score} sublabel="/100" ariaLabel={`ドメインパワー ${domain.score} 点`} />
          )}
          <p className="mt-2 text-center text-[11px] text-muted">
            {domain.host}
            <br />
            採点に使えた配点 {domain.measuredMax} / 100
          </p>
        </div>

        <div>
          {measured.length > 0 && (
            <HBar
              rows={measured.map((s) => ({
                label: s.label,
                value: Math.round((s.score / s.max) * 100),
                valueLabel: `${s.score} / ${s.max} 点`,
                sublabel: s.value,
              }))}
              max={100}
              ticks={[50, 80]}
              labelWidth="12rem"
              legend={false}
              ariaLabel="ドメインパワーの指標ごとの得点"
            />
          )}
          {missing.length > 0 && (
            <p className="mt-3 text-[11px] text-muted">未取得: {missing.map((s) => s.label).join(" / ")}</p>
          )}
        </div>
      </div>

      {(domain.ahrefsDr !== null || domain.openPageRank !== null) && (
        <div className="mt-5 rounded-sm border border-line bg-surface p-4">
          <h3 className="text-sm font-bold text-ink">よく使われる無料ツールと同じ指標</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            他社の「ドメインパワー測定サイト」が出しているのと同じ数値です。上の推定値と違って外部からの被リンクだけを見た指標なので、他社ツールの結果と突き合わせるときはこちらを見てください。
          </p>
          <div className="mt-3 grid gap-3 @xl:grid-cols-2">
            {domain.ahrefsDr !== null && (
              <div className="rounded-sm border border-line bg-panel px-4 py-3">
                <div className="text-[11px] text-muted">Domain Rating（DR）</div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-[22px] font-bold leading-none tabular-nums text-ink">{domain.ahrefsDr.toFixed(0)}</span>
                  <span className="text-[11px] text-muted">/ 100</span>
                </div>
                <div className="mt-1 text-[11px] text-muted">
                  <a href={AHREFS_URL} target="_blank" rel="noopener noreferrer" className="text-accent underline-offset-2 hover:underline">
                    {AHREFS_ATTRIBUTION}
                  </a>
                </div>
              </div>
            )}
            {domain.openPageRank !== null && (
              <div className="rounded-sm border border-line bg-panel px-4 py-3">
                <div className="text-[11px] text-muted">Open PageRank</div>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-[22px] font-bold leading-none tabular-nums text-ink">{domain.openPageRank.toFixed(2)}</span>
                  <span className="text-[11px] text-muted">/ 10</span>
                </div>
                <div className="mt-1 text-[11px] text-muted">
                  {domain.openPageRankWorldRank ? `世界順位 ${domain.openPageRankWorldRank.toLocaleString("ja-JP")} 位` : "Common Crawl のリンクグラフ"}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <ul className="mt-5 divide-y divide-line border-y border-line">
        {domain.signals.map((s) => (
          <li key={s.id} className="grid gap-x-4 gap-y-1 py-2.5 text-[13px] @xl:grid-cols-[5rem_11rem_5rem_1fr] @xl:items-start">
            <div>
              <Badge tone={STATUS_TONE[s.status]} icon={STATUS_TONE[s.status] !== "neutral"}>
                {SIGNAL_STATUS_LABELS[s.status]}
              </Badge>
            </div>
            <div className="font-bold text-ink">{s.label}</div>
            <div className="tabular-nums text-ink">{s.value}</div>
            <div className="leading-relaxed text-muted">
              {s.detail}
              <span className="mt-0.5 block text-[11px]">
                配点 {s.max} 点／出どころ: {SIGNAL_SOURCES[s.id]}
              </span>
            </div>
          </li>
        ))}
      </ul>

      {domain.peers.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2 text-sm font-bold text-ink">競合との比較</h3>
          <p className="mb-2 text-[11px] text-muted">競合サイトはクロールしていないため、外に公開されている指標だけで比べています。</p>
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="border-b border-line text-left text-[11px] text-muted">
                <th className="py-1.5 pr-2 font-normal">ドメイン</th>
                <th className="py-1.5 pr-2 text-right font-normal">DR（0〜100）</th>
                <th className="py-1.5 pr-2 text-right font-normal">Open PageRank（0〜10）</th>
                <th className="py-1.5 text-right font-normal">登録からの年数</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-line">
                <td className="py-1.5 pr-2 font-bold text-ink">{domain.host}（自社）</td>
                <td className="py-1.5 pr-2 text-right tabular-nums text-ink">{domain.ahrefsDr === null ? "—" : domain.ahrefsDr.toFixed(0)}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums text-ink">{domain.openPageRank === null ? "—" : domain.openPageRank.toFixed(2)}</td>
                <td className="py-1.5 text-right tabular-nums text-ink">{domain.ageYears === null ? "—" : `${domain.ageYears.toFixed(1)} 年`}</td>
              </tr>
              {domain.peers.map((p) => (
                <tr key={p.host} className="border-b border-line">
                  <td className="py-1.5 pr-2 break-all text-muted">{p.host}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-muted">{p.ahrefsDr === null ? "—" : p.ahrefsDr.toFixed(0)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums text-muted">{p.openPageRank === null ? "—" : p.openPageRank.toFixed(2)}</td>
                  <td className="py-1.5 text-right tabular-nums text-muted">{p.ageYears === null ? "—" : `${p.ageYears.toFixed(1)} 年`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {domain.notes.length > 0 && <p className="mt-3 text-[11px] leading-relaxed text-muted">{domain.notes.join(" ／ ")}</p>}
      <p className="mt-2 text-[11px] leading-relaxed text-muted">
        この点数は絶対値ではなく、同じ基準で測り直したときの推移や競合との差を見るための目安です。ドメインパワーそのものを上げる操作はできません（外部からのリンク・指名検索・インデックス数が増えた結果として上がります）。
      </p>
    </Card>
  );
}
