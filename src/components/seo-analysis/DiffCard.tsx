/**
 * 前回の診断との差分（直った / 悪化した）。数字で言えるものだけを並べる。
 */
import { Badge, Card } from "@/components/ui";
import { formatDateTime } from "@/lib/report/format";
import type { DiffItem, SheetDiff } from "@/lib/seo-analysis/diff";

function Row({ item, tone }: { item: DiffItem; tone: "pass" | "fail" | "neutral" }) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-1.5 text-[13px]">
      <Badge tone={tone} icon={false}>
        {tone === "pass" ? "直った" : tone === "fail" ? "悪化" : "同じ"}
      </Badge>
      <span className="font-bold text-ink">{item.label}</span>
      <span className="tabular-nums text-muted">
        {item.before} → {item.after}
      </span>
      {item.url && (
        <a href={item.url} target="_blank" rel="noopener noreferrer" className="break-all text-[11px] text-accent underline-offset-2 hover:underline">
          {item.url}
        </a>
      )}
    </li>
  );
}

export function DiffCard({ diff }: { diff: SheetDiff }) {
  return (
    <Card title="前回との比較" description={`${formatDateTime(diff.before)} の診断と比べています。数字で言えるものだけを並べ、AI の文章は比べません。`} printCard className="mb-6">
      <p className="mb-3 text-[15px] font-bold text-ink">{diff.headline}</p>
      {diff.worsened.length > 0 && (
        <div className="mb-3">
          <h3 className="text-[13px] font-bold text-ink">悪化した点（{diff.worsened.length}）</h3>
          <ul className="divide-y divide-line border-y border-line">
            {diff.worsened.map((i) => (
              <Row key={i.label} item={i} tone="fail" />
            ))}
          </ul>
        </div>
      )}
      {diff.improved.length > 0 && (
        <div className="mb-3">
          <h3 className="text-[13px] font-bold text-ink">直った点（{diff.improved.length}）</h3>
          <ul className="divide-y divide-line border-y border-line">
            {diff.improved.map((i) => (
              <Row key={i.label} item={i} tone="pass" />
            ))}
          </ul>
        </div>
      )}
      {diff.same.length > 0 && (
        <details className="text-[12px]">
          <summary className="cursor-pointer text-muted">変わらなかった点（{diff.same.length}）</summary>
          <ul className="mt-1 divide-y divide-line border-y border-line">
            {diff.same.map((i) => (
              <Row key={i.label} item={i} tone="neutral" />
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}
