"use client";

/**
 * 信頼の手がかり（会社情報・連絡先・規約・構造化データ・著者）。
 * サイト診断（A1）の結果に同梱される `trust` を表示する。
 */
import { Badge, Card } from "@/components/ui";
import type { TrustSignals } from "@/lib/seo-analysis/types";
import { pathOf } from "@/lib/report";

export function TrustCard({ trust }: { trust: TrustSignals }) {
  if (trust.checks.length === 0) return null;
  const counts = { pass: 0, warn: 0, fail: 0, info: 0 };
  for (const c of trust.checks) counts[c.status] += 1;
  return (
    <Card
      title="信頼の手がかり"
      description="誰が運営していて、どう連絡できるかがサイトに書かれているかを確かめます。検索エンジンが「信頼できる発信元か」を判断する材料であり、利用者が問い合わせる前に必ず見る情報でもあります。"
      actions={
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="pass" icon={false}>合格 {counts.pass}</Badge>
          <Badge tone="warn" icon={false}>注意 {counts.warn}</Badge>
          <Badge tone="fail" icon={false}>未対応 {counts.fail}</Badge>
        </div>
      }
    >
      <ul className="divide-y divide-line border-y border-line">
        {trust.checks.map((c) => (
          <li key={c.id} className="grid gap-x-4 gap-y-1 py-2.5 text-[13px] @xl:grid-cols-[6rem_12rem_1fr] @xl:items-start">
            <div>
              <Badge tone={c.status}>{c.status === "pass" ? "合格" : c.status === "warn" ? "注意" : c.status === "fail" ? "未対応" : "参考"}</Badge>
            </div>
            <div className="font-bold text-ink">{c.label}</div>
            <div className="leading-relaxed text-muted">
              {c.detail}
              {c.url && (
                <>
                  {" "}
                  <a href={c.url} target="_blank" rel="noopener noreferrer" className="break-all text-accent underline-offset-2 hover:underline">
                    {pathOf(c.url)}
                  </a>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
      {trust.nap.phones.length > 0 && (
        <p className="mt-3 text-[11px] text-muted">
          サイト内で見つかった電話番号: {trust.nap.phones.join(" / ")}
          {trust.nap.schemaTelephone ? `（構造化データ: ${trust.nap.schemaTelephone}）` : ""}
        </p>
      )}
    </Card>
  );
}
