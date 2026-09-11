/**
 * 目指すべき状態（r30）。表示だけ。結論と、指標ごとの絶対値の目安の表。
 * 有料の報告書にだけ出す。各項目の解説（なぜ大事か・目指す状態・毎週見る理由）はチェックリスト側。
 */
import { ReportSection } from "@/components/free/report-parts";
import { IDEAL_STATE, MEO_CONCLUSION } from "@/lib/maps/guide";

export function GoalSection({ number }: { number: number }) {
  return (
    <ReportSection number={number} title="目指すべき状態" lead="この報告書の各項目は、次の状態に近づくための指標です。順位の上下より、この表とのずれを毎週埋めることを優先してください。">
      <p className="text-[14px] leading-relaxed font-bold text-ink">{MEO_CONCLUSION}</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-[12px]">
          <thead>
            <tr className="border-b border-line text-left text-[11px] text-muted">
              <th className="py-1.5 pr-3 font-normal">項目</th>
              <th className="py-1.5 pr-3 font-normal">理想の状態</th>
              <th className="py-1.5 pr-3 font-normal">補足</th>
              <th className="py-1.5 font-normal">この報告書での見方</th>
            </tr>
          </thead>
          <tbody>
            {IDEAL_STATE.map((row) => (
              <tr key={row.item} className="border-b border-line align-top">
                <td className="py-2 pr-3 font-bold whitespace-nowrap text-ink">{row.item}</td>
                <td className="py-2 pr-3 font-bold text-ink">{row.ideal}</td>
                <td className="py-2 pr-3 leading-relaxed text-ink">{row.note}</td>
                <td className="py-2 leading-relaxed text-muted">{row.tool}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ReportSection>
  );
}
