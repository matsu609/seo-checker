"use client";

/**
 * 事実シートの付録と、主張に付く事実 ID のチップ。
 * チップにマウスを載せると、その事実の中身が title で見える。
 */
import { useState } from "react";
import { Badge, Card } from "@/components/ui";
import { FACT_AREA_LABELS, type Fact, type FactArea } from "@/lib/seo-analysis/sheet/types";

const AREA_ORDER: FactArea[] = ["input", "crawl", "structure", "trust", "speed", "search", "domain", "llms", "google"];

export function FactChips({ ids, facts, className = "" }: { ids: readonly string[]; facts: ReadonlyMap<string, Fact>; className?: string }) {
  if (ids.length === 0) return null;
  return (
    <span className={`inline-flex flex-wrap gap-1 ${className}`}>
      {ids.map((id) => {
        const f = facts.get(id);
        return (
          <span
            key={id}
            title={f ? `${f.label}: ${f.value}${f.note ? `（${f.note}）` : ""}` : id}
            className="inline-flex items-center rounded-sm border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px] leading-none text-muted"
          >
            {id}
          </span>
        );
      })}
    </span>
  );
}

export function FactsAppendix({ facts }: { facts: readonly Fact[] }) {
  const [open, setOpen] = useState(false);
  const grouped = new Map<FactArea, Fact[]>();
  for (const f of facts) grouped.set(f.area, [...(grouped.get(f.area) ?? []), f]);
  return (
    <Card
      title="付録: 事実シート"
      description="AI が読んだ数字の一覧です。分析の中の ID（例: S-03）はこの行を指しています。ここに無い数字は AI が作ったものなので、本文には出ない設計です。"
      actions={
        <button type="button" className="text-[13px] text-accent underline-offset-2 hover:underline no-print" onClick={() => setOpen((v) => !v)}>
          {open ? "折りたたむ" : `すべて表示（${facts.length} 行）`}
        </button>
      }
    >
      <div className={open ? "" : "hidden print-expand"}>
        {AREA_ORDER.filter((a) => grouped.has(a)).map((area) => (
          <section key={area} className="mb-5 last:mb-0">
            <h3 className="mb-2 text-sm font-bold text-ink">{FACT_AREA_LABELS[area]}</h3>
            <table className="w-full border-collapse text-[12px]">
              <tbody>
                {grouped.get(area)!.map((f) => (
                  <tr key={f.id} className="border-t border-line align-top">
                    <td className="w-14 py-1.5 pr-2 font-mono text-[11px] text-muted">{f.id}</td>
                    <td className="w-64 py-1.5 pr-3 text-ink">
                      {f.url ? (
                        <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-accent underline-offset-2 hover:underline">
                          {f.label}
                        </a>
                      ) : (
                        f.label
                      )}
                    </td>
                    <td className="py-1.5 text-ink">
                      {f.value}
                      {f.note && <span className="block text-[11px] text-muted">{f.note}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
      {!open && (
        <p className="text-[12px] text-muted no-print">
          {AREA_ORDER.filter((a) => grouped.has(a)).map((a) => (
            <Badge key={a} tone="neutral" icon={false} className="mr-1.5 mb-1">
              {FACT_AREA_LABELS[a]} {grouped.get(a)!.length}
            </Badge>
          ))}
        </p>
      )}
    </Card>
  );
}
