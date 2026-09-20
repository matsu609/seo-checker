/**
 * 利用者へのお知らせ（画面 + メール）。サーバー専用。
 *
 * 定期処理と API から呼ぶ入口。①お知らせの行を保存 → ②設定とメールの設定がそろっていればメール。
 * どちらも失敗しても例外は投げない（本体の処理を止めない）。返り値に何ができたかを正直に返す。
 */
import { getUserStore } from "@/lib/db/user-stores";
import { isSupabaseConfigured } from "@/lib/db/supabase";
import { buildMail } from "@/lib/mail/format";
import { isMailConfigured, sendMail } from "@/lib/mail/send";
import { loadUserAccess } from "@/lib/plans/user";
import { NOTIFICATION_SETTINGS_STORE, parseNotificationSettings, wantsEmail, type NotificationChannel } from "./settings";
import { insertNotification, markEmailed, type NewNotification } from "./store";

export interface NotifyOptions extends NewNotification {
  /** メールの種類（alert = 変化の知らせ、report = 月次レポート）。省略するとメールは送らない */
  channel?: NotificationChannel;
  /** メールの本文（省略時は body）。リンクは link から */
  mailText?: string;
  /** 宛先を明示するとき（テストや、Clerk を読まない場合） */
  to?: string | null;
}

export interface NotifyResult {
  saved: boolean;
  emailed: boolean;
  /** 送らなかった・送れなかった理由（画面には出さない。ログ用） */
  reason: string | null;
}

/** 宛先を決める。設定の宛先 → Clerk の主メール */
export async function resolveRecipient(userId: string, explicit?: string | null): Promise<{ to: string | null; settings: ReturnType<typeof parseNotificationSettings> }> {
  let settings = parseNotificationSettings(undefined);
  try {
    settings = parseNotificationSettings(await getUserStore(userId, NOTIFICATION_SETTINGS_STORE));
  } catch {
    // 設定が読めなくても既定（メールあり）で進める
  }
  if (explicit) return { to: explicit, settings };
  if (settings.address.trim()) return { to: settings.address.trim(), settings };
  const access = await loadUserAccess(userId);
  return { to: access.email, settings };
}

export async function notifyUser(userId: string, options: NotifyOptions): Promise<NotifyResult> {
  let saved = false;
  let id: string | null = null;
  if (isSupabaseConfigured()) {
    try {
      const row = await insertNotification(userId, options);
      saved = true;
      id = row.id;
    } catch (err) {
      console.error("[notify] お知らせを保存できませんでした", userId, options.kind, err instanceof Error ? err.message : err);
    }
  }
  if (!options.channel) return { saved, emailed: false, reason: "メールの対象外" };
  if (!isMailConfigured()) return { saved, emailed: false, reason: "メール送信が未設定" };

  const { to, settings } = await resolveRecipient(userId, options.to);
  if (!wantsEmail(settings, options.channel)) return { saved, emailed: false, reason: "利用者がメールを止めている" };
  if (!to) return { saved, emailed: false, reason: "宛先が無い" };

  const draft = buildMail(options.title, options.mailText ?? options.body, options.link ? { label: "画面で見る", path: options.link } : undefined);
  const result = await sendMail({ to, subject: draft.subject, text: draft.text, html: draft.html });
  if (!result.ok) return { saved, emailed: false, reason: result.error };
  if (saved && id) {
    try {
      await markEmailed(userId, id);
    } catch {
      // 送れたことのほうが大事。印だけ付かない
    }
  }
  return { saved, emailed: true, reason: null };
}
