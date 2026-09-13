/**
 * 付録: 採点方法と基準（MEO 報告書）。表示だけ。
 *
 * 配点と合格ラインを開示する。サイト側の「付録 B」と同じ役割で、
 * 同じ点数でも「何をどう測ったか」が分かるようにするためのもの。
 */
import { ReportSection } from "@/components/free/report-parts";
import { DataTable, type Column } from "@/components/ui";
import { criteriaFor, CRITERIA_NOTE } from "@/lib/maps/criteria";
import type { ProfileScore } from "@/lib/maps/score";

interface Row {
  id: string;
  label: string;
  category: string;
  weight: number;
  pass: string;
  warn: string;
  measured: boolean;
}

const COLUMNS: Column<Row>[] = [
  { key: "label", header: "項目", render: (r) => <span className="font-bold">{r.label}</span> },
  { key: "category", header: "カテゴリ", width: "5.5rem", nowrap: true, render: (r) => <span className="text-[12px] text-muted">{r.category}</span> },
  { key: "weight", header: "配点", align: "right", width: "3rem", nowrap: true, render: (r) => <span className="tabular-nums">{r.weight}</span> },
  { key: "pass", header: "合格（OK）の条件", render: (r) => r.pass },
  { key: "warn", header: "注意になる条件", render: (r) => <span className="text-muted">{r.warn}</span> },
];

export function CriteriaAppendix({ score, number }: { score: ProfileScore; number: number | string }) {
  const rows: Row[] = score.categories.flatMap((cat) =>
    cat.checks.map((check) => {
      const c = criteriaFor(check.id);
      return {
        id: check.id,
        label: check.label,
        category: cat.label,
        weight: check.weight,
        pass: c?.pass ?? check.question,
        warn: c?.warn ?? "—",
        measured: check.status !== "unavailable",
      };
    }),
  );

  return (
    <ReportSection number={number} title="採点方法と基準">
      <div className="space-y-2">
        {CRITERIA_NOTE.map((line) => (
          <p key={line} className="text-[13px] leading-relaxed text-ink">
            {line}
          </p>
        ))}
      </div>
      <div className="mt-4">
        <DataTable rows={rows} columns={COLUMNS} rowKey={(r) => r.id} dense stickyHeader={false} minWidth="40rem" />
      </div>
      <p className="mt-2 text-[11px] text-muted">
        配点の合計は {score.totalWeight} 点。今回はこのうち {score.measuredWeight} 点分を測定しました。
      </p>
    </ReportSection>
  );
}
