/**
 * カテゴリごとのチェックリスト（基本情報 / 投稿 / 写真 / レビュー）。表示だけ。
 * 「n / m 項目を測定」とグレードを見出し右に出し、未取得の項目は薄く表示する。
 */
import { Badge } from "@/components/ui/Badge";
import { Advice, ReportSection } from "@/components/free/report-parts";
import type { CategoryScore, CheckStatus } from "@/lib/maps/score";

const LABEL: Record<CheckStatus, string> = { pass: "OK", warn: "注意", fail: "要改善", unavailable: "未取得" };
const TONE: Record<CheckStatus, "pass" | "warn" | "fail" | "neutral"> = {
  pass: "pass",
  warn: "warn",
  fail: "fail",
  unavailable: "neutral",
};

export function ChecklistSection({ category, number }: { category: CategoryScore; number: number }) {
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
            </div>
            <span className="shrink-0 text-[11px] text-muted tabular-nums">配点 {c.weight}</span>
          </li>
        ))}
      </ul>
    </ReportSection>
  );
}
