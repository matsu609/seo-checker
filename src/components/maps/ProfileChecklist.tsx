/**
 * 自社プロフィールの充実度（項目ごとの判定と改善のヒント）。表示だけ。
 */
import { Badge } from "@/components/ui/Badge";
import type { ProfileCheck } from "@/lib/maps/score";

const LABEL: Record<ProfileCheck["status"], string> = { pass: "OK", warn: "注意", fail: "不足" };

export function ProfileChecklist({ checks }: { checks: ProfileCheck[] }) {
  return (
    <ul className="divide-y divide-line border-y border-line">
      {checks.map((c) => (
        <li key={c.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 py-2.5 text-[13px]">
          <Badge tone={c.status} className="w-14 shrink-0 justify-center">
            {LABEL[c.status]}
          </Badge>
          <span className="w-28 shrink-0 font-bold text-ink">{c.label}</span>
          <span className="min-w-0 flex-1">
            <span className="break-all text-ink">{c.detail}</span>
            {c.advice && <span className="mt-0.5 block text-muted">{c.advice}</span>}
          </span>
          <span className="shrink-0 text-[11px] text-muted tabular-nums">配点 {c.weight}</span>
        </li>
      ))}
    </ul>
  );
}
