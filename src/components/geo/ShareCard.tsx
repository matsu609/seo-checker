"use client";

/**
 * ブランドシェアスコア（仕様書 §3.3 / §5.1）。
 *
 * **見出しは 4 週ローリング**、**信頼区間をバンドで出す**、
 * **n が足りないものはパーセントを出さず段階表示**にする。
 * 「有意差」という言葉は使わない（§5.1-5）。
 */
import type { ReactNode } from "react";
import { Badge, Card } from "@/components/ui";
import { palette } from "@/lib/ui/palette";
import { allowsPercent, BAND_LABELS, marginLabel } from "@/lib/geo/stats";
import { pct } from "@/lib/report/format";
import type { GeoBrand } from "@/lib/geo/types";
import type { ShareRow } from "./client";

const BAND_TONE = { often: "pass", sometimes: "warn", rare: "fail", none: "neutral" } as const;

/** 系列の色。LineChart の SERIES_COLORS と同じ並びにして、グラフと表で色を揃える */
const ROW_COLORS = [palette.chart[0], palette.chart[3], palette.chart[1], palette.chart[2], palette.chart[4], palette.chart[5]] as const;

export function ShareCard({
  rows,
  brands,
  title,
  description,
  actions,
}: {
  rows: ShareRow[];
  brands: GeoBrand[];
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  const nameOf = (id: string) => brands.find((b) => b.id === id)?.displayName ?? id;
  const isOwn = (id: string) => brands.find((b) => b.id === id)?.type === "own";
  const max = Math.max(0.01, ...rows.map((r) => r.ciHigh));

  return (
    <Card title={title} description={description} actions={actions} printCard>
      {rows.length === 0 ? (
        <p className="text-[13px] text-muted">まだ計測結果がありません。プロンプトを登録すると、翌日の定期計測から数字が入ります。</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row, i) => {
            const percentOk = allowsPercent(row.n);
            return (
              <li key={row.brandId} className="grid gap-x-4 gap-y-1 @xl:grid-cols-[12rem_1fr_9rem] @xl:items-center">
                <div className="flex items-center gap-2">
                  {/* グラフの線と同じ色の●。凡例を探して往復しなくてよくする */}
                  <span aria-hidden="true" className="inline-block size-2 shrink-0 rounded-full" style={{ background: ROW_COLORS[i % ROW_COLORS.length] }} />
                  <span className={`min-w-0 truncate text-[13px] ${isOwn(row.brandId) ? "font-bold text-ink" : "text-muted"}`}>{nameOf(row.brandId)}</span>
                  {isOwn(row.brandId) && <Badge tone="info" icon={false}>自社</Badge>}
                </div>

                {/* 信頼区間のバンド。点ではなく幅で見せる（§5.1-2） */}
                <div className="relative h-5 rounded-sm bg-surface" aria-hidden="true">
                  <div
                    className="absolute inset-y-0 rounded-sm bg-accent-soft"
                    style={{ left: `${(row.ciLow / max) * 100}%`, width: `${Math.max(1, ((row.ciHigh - row.ciLow) / max) * 100)}%` }}
                  />
                  <div className="absolute inset-y-0 w-0.5 bg-accent" style={{ left: `${(row.shareMention / max) * 100}%` }} />
                </div>

                <div className="text-right text-[12px] tabular-nums">
                  {percentOk ? (
                    <>
                      <span className="text-[15px] font-bold text-ink">{pct(row.shareMention)}</span>
                      <span className="ml-1 text-muted">{marginLabel({ low: row.ciLow, high: row.ciHigh }, row.shareMention)}</span>
                    </>
                  ) : (
                    <Badge tone={BAND_TONE[row.band]} icon={false}>{BAND_LABELS[row.band]}</Badge>
                  )}
                  <div className="text-[11px] text-muted">観測 {row.n} 件</div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="mt-4 text-[11px] leading-relaxed text-muted">
        帯は 95% 信頼区間です。観測数が少ないうちは幅が広く、細かい上下は読み取れません。
        観測が {30} 件に満たないものは、数字ではなく「よく言及される / たまに / ほとんど無い」の段階で表示します。
      </p>
    </Card>
  );
}
