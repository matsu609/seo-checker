/**
 * メール本文の組み立て（純粋関数。テストで固定する）。
 *
 * テキスト版を正とし、HTML 版はテキストを段落に切って囲うだけ（デザインより届くことを優先）。
 */
import { PUBLIC_APP_ORIGIN } from "@/lib/site";

export const MAIL_SUBJECT_PREFIX = "【SEO Checker】";

export function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** アプリ内のパス → 絶対 URL（メールのリンク用） */
export function appUrl(path: string): string {
  return `${PUBLIC_APP_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
}

/** テキスト → 簡素な HTML（空行で段落、URL はリンクに） */
export function textToHtml(text: string): string {
  const paragraphs = text.replace(/\r\n/g, "\n").split(/\n{2,}/);
  const body = paragraphs
    .map((p) => {
      const lines = p.split("\n").map((line) => escapeHtml(line).replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>'));
      return `<p style="margin:0 0 12px;line-height:1.7">${lines.join("<br>")}</p>`;
    })
    .join("");
  return `<!doctype html><html lang="ja"><body style="font-family:-apple-system,BlinkMacSystemFont,'Hiragino Sans','Noto Sans JP',sans-serif;font-size:14px;color:#142230;padding:16px">${body}</body></html>`;
}

export interface MailDraft {
  subject: string;
  text: string;
  html: string;
}

/** 件名に接頭辞、末尾に共通の署名を付けた下書き */
export function buildMail(subject: string, bodyText: string, link?: { label: string; path: string }): MailDraft {
  const lines = [bodyText.trim()];
  if (link) lines.push("", `${link.label}: ${appUrl(link.path)}`);
  lines.push("", "――", "SEO Checker（AIO 対策の可視化ツール）", `通知の設定: ${appUrl("/settings")}`);
  const text = lines.join("\n");
  return { subject: `${MAIL_SUBJECT_PREFIX}${subject}`, text, html: textToHtml(text) };
}
