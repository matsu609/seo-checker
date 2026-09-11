/**
 * 周辺の同業との比較（r29）。表示だけ。
 * 店舗の位置から半径 1.5 km の同じカテゴリの店舗（人気順 20 件）の中で、自社の評価・口コミ件数が何番目か。
 */
import { EmptyLine, Num, ReportSection, SubHeading } from "@/components/free/report-parts";
import { StatStrip } from "@/components/ui/StatCard";
import { topPercent, type AreaResult } from "@/lib/maps/area";
import { formatDateTime } from "@/lib/report/format";
import { formatCount, formatRating } from "../format";

export function AreaSection({ area, number }: { area: AreaResult | null; number: number }) {
  const total = area ? area.count + 1 : 0;
  const ratingPct = area ? topPercent(area.ratingRank, area.count) : null;
  const countPct = area ? topPercent(area.countRank, area.count) : null;
  return (
    <ReportSection
      number={number}
      title="周辺の同業との比較"
      lead={`店舗の位置から半径 ${((area?.radiusM ?? 1500) / 1000).toFixed(1)} km にある同じメインカテゴリの店舗（Google の人気順で最大 20 件）と、評価・口コミ件数を比べます。競合を登録していなくても地域の中での立ち位置が分かります。`}
    >
      {!area ? (
        <EmptyLine>次回の一斉更新から表示されます（店舗の位置情報が要ります）。</EmptyLine>
      ) : area.error ? (
        <EmptyLine>周辺の店舗を取得できませんでした（{area.error}）。次回の一斉更新で再度取得します。</EmptyLine>
      ) : area.count === 0 ? (
        <EmptyLine>半径 {(area.radiusM / 1000).toFixed(1)} km に同じカテゴリの店舗が見つかりませんでした。</EmptyLine>
      ) : (
        <>
          <StatStrip
            items={[
              { label: "周辺の同業", value: area.count, unit: "店舗" },
              { label: "評価の順位", value: area.ratingRank === null ? "—" : area.ratingRank, unit: area.ratingRank === null ? "" : `/ ${total} 位${ratingPct !== null ? `（上位 ${ratingPct}%）` : ""}` },
              { label: "口コミ件数の順位", value: area.countRank === null ? "—" : area.countRank, unit: area.countRank === null ? "" : `/ ${total} 位${countPct !== null ? `（上位 ${countPct}%）` : ""}` },
              { label: "周辺の平均評価", value: area.avgRating === null ? "—" : area.avgRating.toFixed(1), unit: area.medianCount === null ? "" : `／ 件数の中央値 ${formatCount(area.medianCount)} 件` },
            ]}
          />
          <SubHeading note="口コミ件数の多い順" className="mt-6">
            周辺の上位店舗
          </SubHeading>
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-line text-left text-[11px] text-muted">
                <th className="py-1.5 pr-3 font-normal">店舗</th>
                <th className="py-1.5 pr-3 text-right font-normal">評価</th>
                <th className="py-1.5 text-right font-normal">口コミ</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-line bg-accent-soft">
                <td className="py-1.5 pr-3 font-bold text-ink">自社</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{formatRating(area.own.rating)}</td>
                <td className="py-1.5 text-right tabular-nums">
                  <Num>{formatCount(area.own.ratingCount)}</Num>
                </td>
              </tr>
              {area.top.map((t) => (
                <tr key={t.id} className="border-b border-line">
                  <td className="py-1.5 pr-3 text-ink">{t.name}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{formatRating(t.rating)}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    <Num>{formatCount(t.ratingCount)}</Num>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-[11px] text-muted">計測日時: {formatDateTime(area.measuredAt)}。周辺の店舗は毎週月曜の一斉更新で取り直します。</p>
        </>
      )}
    </ReportSection>
  );
}
