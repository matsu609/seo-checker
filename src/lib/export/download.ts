/**
 * ブラウザでファイルを保存させる（クライアント専用）。
 *
 * 2026-09-23 まで、同じ実装が CSV（export/csv.ts）・PDF（pdf/download.ts）・llms.txt・
 * 設定データの書き出しに重複していた。
 */

/** Blob をファイルとしてダウンロードさせる（jsPDF の save() などはファイル名が反映されないことがあるので、自前でリンクを踏む） */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // click 直後に revoke するとダウンロードが始まらないブラウザがある
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
