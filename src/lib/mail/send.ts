/**
 * メール送信（Resend の REST API を fetch で叩く）。サーバー専用。SDK は足さない。
 *
 * 必要な環境変数: RESEND_API_KEY（`re_` で始まる）と MAIL_FROM（例: `SEO Checker <noreply@seo-checker.tokyo>`。
 * Resend で送信ドメインを検証したアドレス）。どちらかが無ければ isMailConfigured() が false で、
 * 通知は画面のお知らせにだけ残る（送れなかったことを「送った」とは書かない）。
 *
 * 失敗しても例外は投げない（通知はおまけで、本体の処理を止めない）。
 */

export const RESEND_ENDPOINT = "https://api.resend.com/emails";
const TIMEOUT_MS = 15_000;

function env(name: string): string | null {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

export function isMailConfigured(): boolean {
  return env("RESEND_API_KEY") !== null && env("MAIL_FROM") !== null;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /** 返信先（既定は無し） */
  replyTo?: string;
}

export type MailResult = { ok: true; id: string | null } | { ok: false; error: string };

export interface SendMailOptions {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

/** 宛先の形の最低限の検査（送信先を 1 件に限る。改行を含むヘッダインジェクションを防ぐ） */
export function isValidAddress(value: string): boolean {
  return /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value.trim()) && value.length <= 200;
}

export async function sendMail(message: MailMessage, options: SendMailOptions = {}): Promise<MailResult> {
  const key = env("RESEND_API_KEY");
  const from = env("MAIL_FROM");
  if (!key || !from) return { ok: false, error: "メール送信が未設定です（RESEND_API_KEY / MAIL_FROM）" };
  if (!isValidAddress(message.to)) return { ok: false, error: "宛先のメールアドレスが正しくありません" };
  const fetchImpl = options.fetchImpl ?? fetch;
  const signal = options.signal ?? AbortSignal.timeout(TIMEOUT_MS);
  try {
    const res = await fetchImpl(RESEND_ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({
        from,
        to: [message.to.trim()],
        subject: message.subject.replace(/[\r\n]+/g, " ").slice(0, 200),
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
        ...(message.replyTo && isValidAddress(message.replyTo) ? { reply_to: message.replyTo } : {}),
      }),
      signal,
      cache: "no-store",
    });
    if (!res.ok) {
      // 本文には宛先や鍵の情報が混ざり得るのでログに出すのは状態コードだけ
      console.error("[mail] Resend がエラーを返しました", res.status);
      return { ok: false, error: res.status === 401 || res.status === 403 ? "メール送信の API キーが無効です" : `メールを送れませんでした（HTTP ${res.status}）` };
    }
    const body = (await res.json().catch(() => null)) as { id?: unknown } | null;
    return { ok: true, id: typeof body?.id === "string" ? body.id : null };
  } catch (err) {
    console.error("[mail] 送信に失敗", err instanceof Error ? err.message : err);
    return { ok: false, error: "メール送信サービスに接続できませんでした" };
  }
}
