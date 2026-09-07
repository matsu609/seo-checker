"use client";

import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";

export interface TabItem<K extends string = string> {
  id: K;
  label: ReactNode;
  count?: number;
  disabled?: boolean;
}

export interface TabsProps<K extends string = string> {
  tabs: readonly TabItem<K>[];
  value: K;
  onChange: (id: K) => void;
  ariaLabel?: string;
  className?: string;
}

/**
 * 制御コンポーネントのタブ列（role=tablist）。パネル側は呼び出し元が描く。
 * 左右キーで移動、Home / End で端へ。
 */
export function Tabs<K extends string = string>({ tabs, value, onChange, ariaLabel, className = "" }: TabsProps<K>) {
  const baseId = useId();
  const listRef = useRef<HTMLDivElement>(null);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const enabled = tabs.filter((t) => !t.disabled);
    const idx = enabled.findIndex((t) => t.id === value);
    if (enabled.length === 0) return;
    let next = idx;
    if (e.key === "ArrowRight") next = (idx + 1) % enabled.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + enabled.length) % enabled.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = enabled.length - 1;
    else return;
    e.preventDefault();
    const target = enabled[next];
    onChange(target.id);
    const btn = listRef.current?.querySelector<HTMLButtonElement>(`[data-tab-id="${target.id}"]`);
    btn?.focus();
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={`no-print flex gap-1 overflow-x-auto border-b border-line ${className}`}
    >
      {tabs.map((t) => {
        const selected = t.id === value;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`${baseId}-tab-${t.id}`}
            data-tab-id={t.id}
            aria-selected={selected}
            aria-controls={`${baseId}-panel-${t.id}`}
            tabIndex={selected ? 0 : -1}
            disabled={t.disabled}
            onClick={() => onChange(t.id)}
            className={`-mb-px inline-flex h-10 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-50 ${
              selected ? "border-accent font-bold text-accent" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {t.label}
            {t.count !== undefined && (
              <span className="rounded-full border border-line bg-surface px-1.5 text-[10px] tabular-nums text-muted">
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
