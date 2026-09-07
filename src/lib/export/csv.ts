/**
 * 表のダウンロード（CSV）。
 *
 * Excel で開いたときに日本語が化けないよう UTF-8 BOM を付ける。
 * ツール側は「列の定義」と「行」を渡すだけでよい。
 */

export interface CsvColumn<Row> {
  /** 見出し行に出す名前 */
  header: string;
  /** 1 行分の値。undefined / null は空欄になる */
  value: (row: Row) => string | number | boolean | null | undefined;
}

/** 1 セル分をエスケープする（引用符・改行・カンマ・先頭の = を含む値に対応） */
export function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  // 先頭が = + - @ の値は表計算ソフトが数式として解釈するので無効化する
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** 列定義と行から CSV 本文（BOM なし）を作る。純関数なのでテストできる */
export function toCsv<Row>(columns: readonly CsvColumn<Row>[], rows: readonly Row[]): string {
  const lines = [columns.map((c) => csvCell(c.header)).join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => csvCell(c.value(row))).join(","));
  }
  // Excel は CRLF を期待する
  return lines.join("\r\n");
}

/** ASCII だけのファイル名にする（日本語だと download 属性が無視されるブラウザがある） */
export function csvFileName(base: string, at?: Date): string {
  const safe = base.replace(/[^\w.-]/g, "-").replace(/^[-.]+|[-.]+$/g, "") || "export";
  if (!at) return `${safe}.csv`;
  const stamp = `${at.getFullYear()}${String(at.getMonth() + 1).padStart(2, "0")}${String(
    at.getDate(),
  ).padStart(2, "0")}`;
  return `${safe}_${stamp}.csv`;
}

/** ブラウザで CSV をダウンロードさせる（クライアント専用） */
export function downloadCsv<Row>(
  fileName: string,
  columns: readonly CsvColumn<Row>[],
  rows: readonly Row[],
): void {
  const body = toCsv(columns, rows);
  // BOM が無いと Excel が Shift_JIS として開いて日本語が化ける
  const blob = new Blob([`﻿${body}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
