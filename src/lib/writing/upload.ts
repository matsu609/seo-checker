/**
 * 企画書モード（D2）の PDF アップロード検証（純関数・クライアントでも使える）。
 *
 * サーバー側で必ずこの関数を通す。クライアントの申告（MIME・拡張子）は信用せず、
 * base64 の長さから実バイト数を求め、先頭バイトが PDF かどうかも見る。
 * Buffer / atob に依存しないので、ブラウザでも Route Handler でも同じ判定になる。
 */

/** 実装ガイド §11.2 の上限 */
export const MAX_PDF_BYTES = 5 * 1024 * 1024;
export const PDF_MEDIA_TYPE = "application/pdf";
/** base64 に直したときの上限（余裕を見て 4/3 + 改行分） */
export const MAX_PDF_BASE64_LENGTH = Math.ceil((MAX_PDF_BYTES * 4) / 3) + 1_024;

/** "%PDF-" を base64 にしたときの先頭。ファイルの中身が本当に PDF かの最低限の確認 */
const PDF_BASE64_MAGIC = "JVBERi0";
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;

export interface PdfUpload {
  name?: string;
  mediaType: string;
  /** base64（data: URL の接頭辞が付いていても受け付ける） */
  data: string;
}

export type PdfValidation =
  | { ok: true; bytes: number; data: string; name: string }
  | { ok: false; status: 413 | 415 | 422; error: string };

/** base64 の文字列長から実バイト数を求める（デコードせずに数える） */
export function base64Bytes(data: string): number {
  const clean = data.replace(/[\s]/g, "");
  if (clean.length === 0) return 0;
  const padding = clean.endsWith("==") ? 2 : clean.endsWith("=") ? 1 : 0;
  return Math.floor((clean.length * 3) / 4) - padding;
}

/**
 * アップロードされた PDF を検証して、Anthropic の document ブロックに渡せる形にする。
 * 失敗したときは HTTP ステータスと日本語メッセージを返す（Route Handler がそのまま使う）。
 */
export function validatePdfUpload(upload: PdfUpload): PdfValidation {
  const name = (upload.name ?? "").trim().slice(0, 120) || "参考資料.pdf";

  // data: URL の接頭辞は落とす。ここでも MIME を見る（application/pdf 以外は拒否）
  let data = (upload.data ?? "").trim();
  const dataUrl = /^data:([^;,]+)(;base64)?,/i.exec(data);
  if (dataUrl) {
    if (dataUrl[1].toLowerCase() !== PDF_MEDIA_TYPE || !dataUrl[2]) {
      return { ok: false, status: 415, error: "PDF ファイル（application/pdf）だけをアップロードできます" };
    }
    data = data.slice(dataUrl[0].length);
  }
  data = data.replace(/\s/g, "");

  const mediaType = (upload.mediaType ?? "").split(";")[0].trim().toLowerCase();
  if (mediaType !== PDF_MEDIA_TYPE) {
    return { ok: false, status: 415, error: "PDF ファイル（application/pdf）だけをアップロードできます" };
  }
  if (data.length === 0) {
    return { ok: false, status: 422, error: "アップロードされたファイルが空です" };
  }
  if (data.length > MAX_PDF_BASE64_LENGTH) {
    return { ok: false, status: 413, error: "PDF は 5MB までです。ページを絞ってから再度アップロードしてください" };
  }
  if (!BASE64_RE.test(data)) {
    return { ok: false, status: 422, error: "ファイルの読み取りに失敗しました。もう一度アップロードしてください" };
  }
  const bytes = base64Bytes(data);
  if (bytes > MAX_PDF_BYTES) {
    return { ok: false, status: 413, error: "PDF は 5MB までです。ページを絞ってから再度アップロードしてください" };
  }
  if (!data.startsWith(PDF_BASE64_MAGIC)) {
    // 拡張子や MIME だけ PDF を名乗る別形式（画像・実行ファイル）を弾く
    return { ok: false, status: 415, error: "PDF として読み取れないファイルです。PDF 形式のファイルを選んでください" };
  }
  return { ok: true, bytes, data, name };
}

/** 画面に出すサイズ表記 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
