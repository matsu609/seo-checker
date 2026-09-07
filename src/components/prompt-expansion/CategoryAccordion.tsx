"use client";

/**
 * カテゴリごとのアコーディオン。件数・定義・1 本ずつの文字数を出し、
 * チェックしたものを LLMO モニタリングに登録できるようにする。
 */
import { Badge, Button } from "@/components/ui";
import type { ExpandedCategory } from "@/lib/llmo/expansion/types";

export interface CategoryAccordionProps {
  category: ExpandedCategory;
  selected: ReadonlySet<string>;
  onToggle: (text: string, checked: boolean) => void;
  onToggleAll: (texts: string[], checked: boolean) => void;
  onCopy: (texts: string[], withCategory: boolean) => void;
  copiedLabel: string | null;
  defaultOpen?: boolean;
}

export function CategoryAccordion({
  category,
  selected,
  onToggle,
  onToggleAll,
  onCopy,
  copiedLabel,
  defaultOpen = false,
}: CategoryAccordionProps) {
  const texts = category.prompts.map((p) => p.text);
  const allChecked = texts.length > 0 && texts.every((t) => selected.has(t));

  return (
    <details open={defaultOpen} className="rounded-sm border border-line bg-panel">
      <summary className="cursor-pointer list-none px-4 py-3 marker:content-none">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-bold text-ink">{category.name}</span>
          <Badge tone="neutral">{category.prompts.length} 件</Badge>
          <span className="min-w-0 flex-1 text-[12px] text-muted">{category.definition}</span>
        </span>
      </summary>
      <div className="border-t border-line px-4 py-3">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <label className="inline-flex items-center gap-1.5 text-[12px] text-ink">
            <input
              type="checkbox"
              className="h-4 w-4 accent-accent"
              checked={allChecked}
              onChange={(e) => onToggleAll(texts, e.target.checked)}
            />
            すべて選択
          </label>
          <Button variant="secondary" size="sm" onClick={() => onCopy(texts, false)}>
            {copiedLabel === `${category.name}:plain` ? "コピーしました" : "プロンプトのみコピー"}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => onCopy(texts, true)}>
            {copiedLabel === `${category.name}:labeled` ? "コピーしました" : "カテゴリ名を入れてコピー"}
          </Button>
        </div>
        <ul className="space-y-1">
          {category.prompts.map((p) => (
            <li key={p.text} className="flex items-start gap-2 border-b border-line py-1.5 last:border-0">
              <input
                type="checkbox"
                aria-label={`${p.text} を選択`}
                className="mt-1 h-4 w-4 shrink-0 accent-accent"
                checked={selected.has(p.text)}
                onChange={(e) => onToggle(p.text, e.target.checked)}
              />
              <span className="min-w-0 flex-1 text-[13px] leading-relaxed text-ink">{p.text}</span>
              <span className="shrink-0 text-[11px] text-muted tabular-nums">{p.chars} 字</span>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
