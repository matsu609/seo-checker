/**
 * カテゴリごとのチェックリスト（基本情報 / 投稿 / 写真 / レビュー）。表示だけ。
 * 「n / m 項目を測定」とグレードを見出し右に出し、未取得の項目は薄く表示する。
 */
import { Badge } from "@/components/ui/Badge";
import { Advice, ReportSection } from "@/components/free/report-parts";
import { guideFor } from "@/lib/maps/guide";
import type { CategoryScore, CheckStatus } from "@/lib/maps/score";

const LABEL: Record<CheckStatus, string> = { pass: "OK", warn: "注意", fail: "要改善", unavailable: "未取得" };
const TONE: Record<CheckStatus, "pass" | "warn" | "fail" | "neutral"> = {
  pass: "pass",
  warn: "warn",
  fail: "fail",
  unavailable: "neutral",
};

function Guide({ id }: { id: string }) {
  const g = guideFor(id);
  if (!g) return null;
  return (
    <dl className="mt-2 space-y-1 rounded-sm bg-surface px-3 py-2 text-[12px] leading-relaxed text-ink">
      <div className="flex gap-2">
        <dt className="w-[6.5em] shrink-0 font-bold text-muted">なぜ大事か</dt>
        <dd>{g.why}</dd>
      </div>
      <div className="flex gap-2">
        <dt className="w-[6.5em] shrink-0 font-bold text-muted">目指す状態</dt>
        <dd className="font-bold">{g.goal}</dd>
      </div>
      <div className="flex gap-2">
        <dt className="w-[6.5em] shrink-0 font-bold text-muted">毎週見る理由</dt>
        <dd>{g.keep}</dd>
      </div>
    </dl>
  );
}

export interface ChecklistSectionProps {
  category: CategoryScore;
  number: number;
  /** 各項目に解説（なぜ大事か・目指す状態・毎週見る理由）を添える（有料の報告書） */
  guide?: boolean;
}

export function ChecklistSection({ category, number, guide = false }: ChecklistSectionProps) {
  return (
    <ReportSection
      number={number}
      title={
        <span className="flex flex-wrap items-baseline gap-x-3">
          {category.label}
          <span className="text-[12px] font-normal text-muted tabular-nums">
            {category.measured} / {category.total} 項目を測定
          </span>
          {category.grade && (
            <span className="text-[13px] font-bold tabular-nums" style={{ color: category.grade.color }}>
              {category.grade.grade}（{category.grade.label}）
            </span>
          )}
        </span>
      }
    >
      <ul className="divide-y divide-line border-y border-line">
        {category.checks.map((c) => (
          <li
            key={c.id}
            className={`flex flex-wrap items-start gap-x-4 gap-y-1 py-3 text-[13px] ${c.status === "unavailable" ? "opacity-70" : ""}`}
          >
            <Badge tone={TONE[c.status]} icon={c.status !== "unavailable"} className="w-16 shrink-0 justify-center">
              {LABEL[c.status]}
            </Badge>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-bold text-ink">{c.label}</span>
                <span className="text-[11px] text-muted">{c.question}</span>
                {c.source === "owner" && (
                  <Badge tone="neutral" icon={false} className="text-[10px]">
                    オーナー入力
                  </Badge>
                )}
              </div>
              <p className="mt-0.5 break-all text-ink">{c.detail}</p>
              {c.advice && <Advice>{c.advice}</Advice>}
              {guide && <Guide id={c.id} />}
            </div>
            <span className="shrink-0 text-[11px] text-muted tabular-nums">配点 {c.weight}</span>
          </li>
        ))}
      </ul>
    </ReportSection>
  );
}
