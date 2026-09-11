/**
 * 検索順位（r29）。表示だけ。対策キーワードごとに、自社と登録済みの競合が
 * Google マップ検索で何番目に出るかを表にする。
 */
import { EmptyLine, ReportSection } from "@/components/free/report-parts";
import { formatRank, type MeoRankResult } from "@/lib/maps/rank";
import { formatDateTime } from "@/lib/report/format";

function Delta({ rank, previous }: { rank: number | null; previous: number | null | undefined }) {
  if (previous === undefined) return null;
  if (rank === null && previous === null) return null;
  if (previous === null) return <span className="ml-1 text-[11px] text-pass">（圏内に入りました）</span>;
  if (rank === null) return <span className="ml-1 text-[11px] text-fail">（前回 {previous} 位 → 圏外）</span>;
  const d = previous - rank;
  if (d === 0) return <span className="ml-1 text-[11px] text-muted">（前回と同じ）</span>;
  return <span className={`ml-1 text-[11px] ${d > 0 ? "text-pass" : "text-fail"}`}>（前回 {previous} 位、{d > 0 ? `${d} つ上昇` : `${-d} つ下降`}）</span>;
}

export function RankSection({ rank, number }: { rank: MeoRankResult | null; number: number }) {
  const competitors = rank?.keywords[0]?.competitors ?? [];
  const measuredAt = rank?.keywords.find((k) => k.error === null)?.measuredAt ?? null;
  return (
    <ReportSection
      number={number}
      title="検索順位（Google マップ検索）"
      lead={`店舗の位置を中心に半径 ${((rank?.radiusM ?? 3000) / 1000).toFixed(0)} km で、対策キーワードを Google マップ検索したときの並び順です（Places API が返す順序。実際の表示は検索する場所・端末・時間で変わります）。上位 ${rank?.limit ?? 20} 件まで見ます。`}
    >
      {!rank || rank.keywords.length === 0 ? (
        <EmptyLine>「オーナー情報の入力」で対策キーワードを設定すると、毎週の一斉更新で順位を記録します。</EmptyLine>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[32rem] border-collapse text-[13px]">
              <thead>
                <tr className="border-b border-line text-left text-[11px] text-muted">
                  <th className="py-1.5 pr-3 font-normal">キーワード</th>
                  <th className="py-1.5 pr-3 font-normal">自社</th>
                  {competitors.map((c) => (
                    <th key={c.placeId} className="py-1.5 pr-3 font-normal">
                      {c.name}
                    </th>
                  ))}
                  <th className="py-1.5 font-normal">上位 3 件</th>
                </tr>
              </thead>
              <tbody>
                {rank.keywords.map((k) => (
                  <tr key={k.keyword} className="border-b border-line align-top">
                    <td className="py-2 pr-3 font-bold text-ink">{k.keyword}</td>
                    <td className="py-2 pr-3 tabular-nums text-ink">
                      {k.error ? (
                        <span className="text-fail">取得できず（{k.error}）</span>
                      ) : (
                        <>
                          <span className="font-bold">{formatRank(k.rank, rank.limit)}</span>
                          <Delta rank={k.rank} previous={k.previous} />
                        </>
                      )}
                    </td>
                    {k.competitors.map((c) => (
                      <td key={c.placeId} className="py-2 pr-3 tabular-nums text-ink">
                        {k.error ? "—" : formatRank(c.rank, rank.limit)}
                      </td>
                    ))}
                    <td className="py-2 text-[12px] text-muted">
                      {k.top.length === 0 ? "—" : k.top.map((t, i) => `${i + 1}. ${t.name}`).join(" ／ ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {measuredAt && <p className="mt-2 text-[11px] text-muted">計測日時: {formatDateTime(measuredAt)}。順位は毎週月曜の一斉更新で取り直します。</p>}
        </>
      )}
    </ReportSection>
  );
}
