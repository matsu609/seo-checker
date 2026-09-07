"use client";

import { useMemo, useState, type ReactNode } from "react";

export type SortValue = string | number | null | undefined;

export interface Column<T> {
  key: string;
  header: ReactNode;
  /** セルの描画。省略時は accessor の値をそのまま出す */
  render?: (row: T, index: number) => ReactNode;
  /** 並び替え・既定表示に使う値 */
  accessor?: (row: T) => SortValue;
  align?: "left" | "right" | "center";
  sortable?: boolean;
  /** 例: "8rem"。省略時は自動 */
  width?: string;
  nowrap?: boolean;
  className?: string;
}

export interface SortState {
  key: string;
  dir: "asc" | "desc";
}

export interface DataTableProps<T> {
  rows: readonly T[];
  columns: readonly Column<T>[];
  rowKey: (row: T, index: number) => string;
  /** 制御したいときに渡す。省略時は内部で保持 */
  sort?: SortState | null;
  onSortChange?: (sort: SortState | null) => void;
  defaultSort?: SortState | null;
  emptyText?: ReactNode;
  caption?: ReactNode;
  /** 行を詰める（行高 32px） */
  dense?: boolean;
  /** thead を sticky にする（画面のみ） */
  stickyHeader?: boolean;
  /** 横スクロール時の最小幅（例: "34rem"） */
  minWidth?: string;
  className?: string;
  rowClassName?: (row: T, index: number) => string | undefined;
}

const ALIGN = { left: "text-left", right: "text-right tabular-nums", center: "text-center" } as const;

function compare(a: SortValue, b: SortValue): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "ja");
}

/**
 * 汎用の表。thead 12px / 700 / muted、本文 13px、行罫 1px line。
 * ラッパーは `overflow-x-auto`（印刷・PDF の両経路で解除される）。
 */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  sort,
  onSortChange,
  defaultSort = null,
  emptyText = "表示できるデータがありません。",
  caption,
  dense = false,
  stickyHeader = true,
  minWidth,
  className = "",
  rowClassName,
}: DataTableProps<T>) {
  const [innerSort, setInnerSort] = useState<SortState | null>(defaultSort);
  const current = sort !== undefined ? sort : innerSort;

  function setSort(next: SortState | null) {
    if (onSortChange) onSortChange(next);
    if (sort === undefined) setInnerSort(next);
  }

  function toggle(col: Column<T>) {
    if (!col.sortable) return;
    if (!current || current.key !== col.key) setSort({ key: col.key, dir: "asc" });
    else if (current.dir === "asc") setSort({ key: col.key, dir: "desc" });
    else setSort(null);
  }

  const sorted = useMemo(() => {
    if (!current) return rows;
    const col = columns.find((c) => c.key === current.key);
    if (!col?.accessor) return rows;
    const acc = col.accessor;
    const dir = current.dir === "asc" ? 1 : -1;
    return rows
      .map((row, i) => ({ row, i }))
      .sort((x, y) => compare(acc(x.row), acc(y.row)) * dir || x.i - y.i)
      .map((x) => x.row);
  }, [rows, columns, current]);

  const cell = dense ? "px-2 py-1.5" : "px-2 py-2";

  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full text-[13px] text-ink" style={minWidth ? { minWidth } : undefined}>
        {caption && <caption className="mb-2 text-left text-[12px] text-muted">{caption}</caption>}
        <thead className={stickyHeader ? "sticky top-0 z-[1] bg-panel" : "bg-panel"}>
          <tr className="border-b border-line text-[12px] font-bold text-muted">
            {columns.map((col) => {
              const active = current?.key === col.key;
              const ariaSort = active ? (current!.dir === "asc" ? "ascending" : "descending") : undefined;
              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={col.sortable ? (ariaSort ?? "none") : undefined}
                  style={col.width ? { width: col.width } : undefined}
                  className={`${cell} font-bold ${ALIGN[col.align ?? "left"]} ${col.nowrap ? "whitespace-nowrap" : ""} ${col.className ?? ""}`}
                >
                  {col.sortable ? (
                    <button
                      type="button"
                      onClick={() => toggle(col)}
                      className="inline-flex items-center gap-1 rounded-sm outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-accent/40"
                    >
                      {col.header}
                      <span aria-hidden className="text-[10px]">
                        {active ? (current!.dir === "asc" ? "▲" : "▼") : "△"}
                      </span>
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-2 py-6 text-center text-[13px] text-muted">
                {emptyText}
              </td>
            </tr>
          ) : (
            sorted.map((row, i) => (
              <tr key={rowKey(row, i)} className={`border-b border-line last:border-0 ${rowClassName?.(row, i) ?? ""}`}>
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={`${cell} align-top ${ALIGN[col.align ?? "left"]} ${col.nowrap ? "whitespace-nowrap" : ""} ${col.className ?? ""}`}
                  >
                    {col.render ? col.render(row, i) : (col.accessor?.(row) ?? "")}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
